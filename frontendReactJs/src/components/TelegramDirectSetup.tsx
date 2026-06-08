import { useEffect, useState } from "react";
import { apiFetch, apiJson } from "../lib/api";

interface DirectStatus {
  active: boolean;
  connected: boolean;
  phoneNumber: string | null;
}

interface Props {
  token?: string | null;
}

export default function TelegramDirectSetup({ token }: Props) {
  const [status, setStatus] = useState<DirectStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [step, setStep] = useState<"idle" | "code" | "2fa">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const resp = await apiFetch("/telegram/direct/status", {}, token);
      if (!resp.ok) return;
      const j = await resp.json();
      setStatus(j.data ?? null);
      if (j.data?.active) setStep("idle");
    } catch { /* ignore */ }
  };

  useEffect(() => { void loadStatus(); }, [token]);

  const requestCode = async () => {
    if (!phone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson("/telegram/direct/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone.trim() }),
      }, token);
      setStep("code");
    } catch (err: any) {
      setError(err?.message ?? "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson("/telegram/direct/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), password: twoFaPassword || undefined }),
      }, token);
      setStep("idle");
      setCode("");
      setTwoFaPassword("");
      await loadStatus();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.toLowerCase().includes("two-factor") || msg.toLowerCase().includes("password")) {
        setStep("2fa");
        setError("2FA required — enter your Telegram cloud password below");
      } else {
        setError(msg || "Verification failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Telegram Direct Messaging?")) return;
    setBusy(true);
    try {
      await apiFetch("/telegram/direct/session", { method: "DELETE" }, token);
      setStatus(null);
      setStep("idle");
      setPhone("");
    } finally {
      setBusy(false);
    }
  };

  if (status?.active) {
    return (
      <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
        <div className="settings-row" style={{ width: "100%", padding: 0 }}>
          <div className="settings-row-label">
            <strong>Telegram Direct</strong>
            <span>{status.phoneNumber ?? "Connected"} — messages sent directly (not via bot)</span>
          </div>
          <span className="chip green">Active</span>
        </div>
        <button className="btn-ghost btn-sm" type="button" onClick={disconnect} disabled={busy}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 0 8px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="settings-row-label" style={{ paddingBottom: 4 }}>
        <strong>Telegram Direct Messaging</strong>
        <span>Connect your personal Telegram account to send messages directly (not through CryptBot)</span>
      </div>

      {error && (
        <div style={{ color: "var(--red, #e53e3e)", fontSize: 13, padding: "4px 0" }}>{error}</div>
      )}

      {step === "idle" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            style={{ flex: 1 }}
            type="tel"
            placeholder="+1234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={busy}
          />
          <button type="button" onClick={requestCode} disabled={busy || !phone.trim()}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </div>
      )}

      {(step === "code" || step === "2fa") && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              style={{ flex: 1 }}
              type="text"
              inputMode="numeric"
              placeholder="Telegram code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
          </div>
          {step === "2fa" && (
            <input
              type="password"
              placeholder="Telegram 2FA password"
              value={twoFaPassword}
              onChange={(e) => setTwoFaPassword(e.target.value)}
              disabled={busy}
            />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={verifyCode} disabled={busy || !code.trim()}>
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button className="btn-ghost btn-sm" type="button" onClick={() => { setStep("idle"); setCode(""); setError(null); }}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
