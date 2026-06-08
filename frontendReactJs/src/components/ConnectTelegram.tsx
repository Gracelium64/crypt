import { useEffect, useState } from "react";
import { apiFetch, apiJson } from "../lib/api";

interface TelegramStatus {
  active: boolean;
  connected: boolean;
  phoneNumber: string | null;
}

interface Props {
  token?: string | null;
  onConnected?: () => void;
}

export default function ConnectTelegram({ token, onConnected }: Props) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"idle" | "code" | "2fa">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    if (!token) return;
    try {
      const resp = await apiFetch("/telegram/direct/status", {}, token);
      if (!resp.ok) return;
      const j = await resp.json();
      setStatus(j.data ?? null);
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
        body: JSON.stringify({ code: code.trim(), password: password || undefined }),
      }, token);
      setStep("idle");
      setCode("");
      setPassword("");
      await loadStatus();
      onConnected?.();
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.toLowerCase().includes("two-factor") || msg.toLowerCase().includes("password")) {
        setStep("2fa");
        setError("2FA required — enter your Telegram cloud password");
      } else {
        setError(msg || "Verification failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Telegram?")) return;
    setBusy(true);
    try {
      await apiFetch("/telegram/direct/session", { method: "DELETE" }, token);
      setStatus(null);
      setPhone("");
    } finally {
      setBusy(false);
    }
  };

  // Connected state
  if (status?.active) {
    return (
      <div className="settings-row">
        <div className="settings-row-label">
          <strong>{status.phoneNumber ?? "Connected"}</strong>
          <span>Telegram connected — messages send directly</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="chip green">Active</span>
          <button className="btn-ghost btn-sm" type="button" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  // Phone entry
  if (step === "idle") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {error && <div style={{ color: "var(--red, #e53e3e)", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1 }}
            type="tel"
            placeholder="+1234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void requestCode(); }}
            disabled={busy}
            autoFocus
          />
          <button type="button" onClick={requestCode} disabled={busy || !phone.trim()}>
            {busy ? "Sending…" : "Continue"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
          A code will appear in your Telegram app (Telegram → chats → "Telegram").
        </div>
      </div>
    );
  }

  // Code + optional 2FA entry
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && <div style={{ color: "var(--red, #e53e3e)", fontSize: 13 }}>{error}</div>}
      <input
        type="text"
        inputMode="numeric"
        placeholder="Enter code from Telegram"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && step !== "2fa") void verifyCode(); }}
        disabled={busy}
        autoFocus
      />
      {step === "2fa" && (
        <input
          type="password"
          placeholder="Telegram 2FA password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void verifyCode(); }}
          disabled={busy}
        />
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={verifyCode} disabled={busy || !code.trim()}>
          {busy ? "Verifying…" : "Confirm"}
        </button>
        <button className="btn-ghost btn-sm" type="button"
          onClick={() => { setStep("idle"); setCode(""); setError(null); }}>
          Back
        </button>
      </div>
    </div>
  );
}
