import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
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
  const [mode, setMode] = useState<"phone" | "qr">("phone");

  // phone flow
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [step, setStep] = useState<"idle" | "code" | "2fa">("idle");

  // qr flow
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStep, setQrStep] = useState<"idle" | "scanning" | "2fa" | "done" | "error">("idle");
  const [qr2faPassword, setQr2faPassword] = useState("");
  const [qrError, setQrError] = useState<string | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // ── QR polling ────────────────────────────────────────────────────────────

  const stopQrPoll = () => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
  };

  const startQrPoll = () => {
    stopQrPoll();
    qrPollRef.current = setInterval(async () => {
      try {
        const resp = await apiFetch("/telegram/direct/qr-status", {}, token);
        if (!resp.ok) return;
        const j = await resp.json();
        const data = j.data as { token: string; step: string; error?: string };

        if (data.token) {
          const url = await QRCode.toDataURL(data.token, { width: 200, margin: 1 });
          setQrDataUrl(url);
        }

        if (data.step === "2fa") {
          setQrStep("2fa");
        } else if (data.step === "done") {
          stopQrPoll();
          setQrStep("done");
          setQrDataUrl(null);
          await loadStatus();
        } else if (data.step === "error") {
          stopQrPoll();
          setQrStep("error");
          setQrError(data.error ?? "QR login failed");
        }
      } catch { /* non-fatal */ }
    }, 4000);
  };

  useEffect(() => () => stopQrPoll(), []);

  const requestQr = async () => {
    setBusy(true);
    setQrError(null);
    setQrDataUrl(null);
    setQrStep("scanning");
    try {
      await apiJson("/telegram/direct/request-qr", { method: "POST" }, token);
      startQrPoll();
    } catch (err: any) {
      setQrStep("error");
      setQrError(err?.message ?? "Failed to start QR login");
    } finally {
      setBusy(false);
    }
  };

  const submitQr2fa = async () => {
    if (!qr2faPassword.trim()) return;
    setBusy(true);
    try {
      await apiJson("/telegram/direct/qr-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: qr2faPassword.trim() }),
      }, token);
      setQrStep("scanning");
      setQr2faPassword("");
      startQrPoll();
    } catch (err: any) {
      setQrError(err?.message ?? "2FA failed");
    } finally {
      setBusy(false);
    }
  };

  // ── Phone flow ────────────────────────────────────────────────────────────

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

  // ── Disconnect ────────────────────────────────────────────────────────────

  const disconnect = async () => {
    if (!confirm("Disconnect Telegram Direct Messaging?")) return;
    setBusy(true);
    stopQrPoll();
    try {
      await apiFetch("/telegram/direct/session", { method: "DELETE" }, token);
      setStatus(null);
      setStep("idle");
      setQrStep("idle");
      setPhone("");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

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

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className={mode === "phone" ? "btn-sm" : "btn-ghost btn-sm"}
          type="button"
          onClick={() => { setMode("phone"); stopQrPoll(); setQrStep("idle"); setQrDataUrl(null); setQrError(null); }}
        >
          Phone code
        </button>
        <button
          className={mode === "qr" ? "btn-sm" : "btn-ghost btn-sm"}
          type="button"
          onClick={() => { setMode("qr"); setStep("idle"); setError(null); }}
        >
          QR code
        </button>
      </div>

      {mode === "phone" && (
        <>
          {error && <div style={{ color: "var(--red, #e53e3e)", fontSize: 13 }}>{error}</div>}

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
        </>
      )}

      {mode === "qr" && (
        <>
          {qrError && <div style={{ color: "var(--red, #e53e3e)", fontSize: 13 }}>{qrError}</div>}

          {qrStep === "idle" && (
            <button type="button" onClick={requestQr} disabled={busy}>
              {busy ? "Starting…" : "Generate QR code"}
            </button>
          )}

          {qrStep === "scanning" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="Telegram QR login" style={{ width: 200, height: 200, borderRadius: 8 }} />
                : <div style={{ width: 200, height: 200, background: "var(--surface-2, #eee)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--muted)" }}>Generating…</div>
              }
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Open Telegram → Settings → Devices → Link Desktop Device, then scan this code.
              </span>
              <button className="btn-ghost btn-sm" type="button" onClick={() => { stopQrPoll(); setQrStep("idle"); setQrDataUrl(null); }}>
                Cancel
              </button>
            </div>
          )}

          {qrStep === "2fa" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13 }}>2FA required — enter your Telegram cloud password.</span>
              <input
                type="password"
                placeholder="Telegram 2FA password"
                value={qr2faPassword}
                onChange={(e) => setQr2faPassword(e.target.value)}
                disabled={busy}
              />
              <button type="button" onClick={submitQr2fa} disabled={busy || !qr2faPassword.trim()}>
                {busy ? "Submitting…" : "Submit"}
              </button>
            </div>
          )}

          {qrStep === "error" && (
            <button type="button" onClick={requestQr} disabled={busy}>
              Try again
            </button>
          )}
        </>
      )}
    </div>
  );
}
