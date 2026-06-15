import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
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
  const [mode, setMode] = useState<"phone" | "qr">("phone");

  // phone flow
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"idle" | "code" | "2fa">("idle");
  const [error, setError] = useState<string | null>(null);

  // qr flow
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<string>("");
  const [qrStep, setQrStep] = useState<"idle" | "scanning" | "2fa" | "done" | "error">("idle");
  const [qr2faPassword, setQr2faPassword] = useState("");
  const [qrError, setQrError] = useState<string | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [busy, setBusy] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

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
          setQrToken(data.token);
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
          onConnected?.();
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
    setQrToken("");
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

  // ── Disconnect ────────────────────────────────────────────────────────────

  const disconnect = async () => {
    setBusy(true);
    setDisconnectConfirm(false);
    stopQrPoll();
    try {
      await apiFetch("/telegram/direct/session", { method: "DELETE" }, token);
      setStatus(null);
      setPhone("");
      setStep("idle");
      setQrStep("idle");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (status?.active) {
    return (
      <div className="settings-row">
        <div className="settings-row-label">
          <strong>{status.phoneNumber ?? "Connected"}</strong>
          <span>Telegram connected — messages send directly</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="chip green">Active</span>
          {disconnectConfirm ? (
            <>
              <span style={{ fontSize: 13 }}>Disconnect?</span>
              <button className="btn-sm btn-danger" type="button" onClick={() => void disconnect()} disabled={busy}>
                Yes
              </button>
              <button className="btn-ghost btn-sm" type="button" onClick={() => setDisconnectConfirm(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn-ghost btn-sm" type="button" onClick={() => setDisconnectConfirm(true)} disabled={busy}>
              Disconnect
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            <>
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
            </>
          )}

          {(step === "code" || step === "2fa") && (
            <>
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
            </>
          )}
        </>
      )}

      {mode === "qr" && (
        <>
          {qrError && <div style={{ color: "var(--red, #e53e3e)", fontSize: 13 }}>{qrError}</div>}

          {qrStep === "idle" && (
            <>
              <button type="button" onClick={requestQr} disabled={busy}>
                {busy ? "Starting…" : "Generate QR code"}
              </button>
              <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
                Open Telegram → Settings → Devices → Link Desktop Device, then scan.
              </div>
            </>
          )}

          {qrStep === "scanning" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {qrToken
                ? (
                  <a
                    href={qrToken}
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      textAlign: "center",
                      padding: "12px 0",
                      borderRadius: 10,
                      background: "var(--accent, #2ea6ff)",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 15,
                      textDecoration: "none",
                    }}
                  >
                    Open in Telegram
                  </a>
                )
                : <div style={{ height: 44, background: "var(--surface2, #1a2337)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--muted)" }}>Generating…</div>
              }
              <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
                Tap the button above to open Telegram on this device and confirm the login.
              </div>
              {qrDataUrl && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 12, color: "var(--fg-muted, #888)", cursor: "pointer", userSelect: "none" }}>
                    Or scan with another device
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <img src={qrDataUrl} alt="Telegram QR login" style={{ width: 180, height: 180, borderRadius: 8, display: "block" }} />
                    <div style={{ fontSize: 12, color: "var(--fg-muted, #888)", marginTop: 6 }}>
                      Telegram → Settings → Devices → Link Desktop Device
                    </div>
                  </div>
                </details>
              )}
              <button className="btn-ghost btn-sm" type="button" onClick={() => { stopQrPoll(); setQrStep("idle"); setQrDataUrl(null); setQrToken(""); }}>
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
                onKeyDown={(e) => { if (e.key === "Enter") void submitQr2fa(); }}
                disabled={busy}
                autoFocus
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
