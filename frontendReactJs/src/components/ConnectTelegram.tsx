import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { apiFetch, apiJson } from "../lib/api";
import useLink from "@/hooks/useLink";

interface TelegramStatus {
  active: boolean;
  connected: boolean;
  phoneNumber: string | null;
}

interface Props {
  token?: string | null;
  onConnected?: () => void;
}

type Mode = "phone" | "qr" | "bot";

export default function ConnectTelegram({ token, onConnected }: Props) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [mode, setMode] = useState<Mode>("phone");

  // phone flow
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"idle" | "code" | "2fa">("idle");
  const [error, setError] = useState<string | null>(null);

  // qr flow
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStep, setQrStep] = useState<"idle" | "scanning" | "2fa" | "done" | "error">("idle");
  const [qr2faPassword, setQr2faPassword] = useState("");
  const [qrError, setQrError] = useState<string | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // bot link flow
  const { linkCode, linkStatus, linkDeepMobile, linkDeepWeb, linkBusy, startLink, cancelLink } =
    useLink(token, onConnected);

  const [busy, setBusy] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  // Restore bot mode if a pending link is recovered from sessionStorage
  useEffect(() => {
    if (linkCode) setMode("bot");
  }, [linkCode]);

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
          const url = await QRCode.toDataURL(data.token, { width: 220, margin: 2 });
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

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setQrError(null);
    if (m !== "qr") { stopQrPoll(); setQrStep("idle"); setQrDataUrl(null); }
    if (m !== "phone") { setStep("idle"); }
    if (m !== "bot") cancelLink();
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
              <button className="btn-sm btn-danger" type="button" onClick={() => void disconnect()} disabled={busy}>Yes</button>
              <button className="btn-ghost btn-sm" type="button" onClick={() => setDisconnectConfirm(false)}>Cancel</button>
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
      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["phone", "qr", "bot"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={mode === m ? "btn-sm" : "btn-ghost btn-sm"}
            onClick={() => switchMode(m)}
          >
            {m === "phone" ? "Phone code" : m === "qr" ? "QR code" : "Via CryptBot"}
          </button>
        ))}
      </div>

      {/* ── Phone code ── */}
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
                A code will appear as a message from "Telegram" in your Telegram app (not SMS).
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

      {/* ── QR code ── */}
      {mode === "qr" && (
        <>
          {qrError && <div style={{ color: "var(--red, #e53e3e)", fontSize: 13 }}>{qrError}</div>}

          {qrStep === "idle" && (
            <>
              <button type="button" onClick={requestQr} disabled={busy}>
                {busy ? "Starting…" : "Generate QR code"}
              </button>
              <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
                You will need a second device (computer or another phone) to scan the code.
              </div>
            </>
          )}

          {qrStep === "scanning" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="Telegram QR login" style={{ width: 220, height: 220, borderRadius: 8, display: "block" }} />
                : <div style={{ width: 220, height: 220, background: "var(--surface2, #1a2337)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "var(--muted)" }}>Generating…</div>
              }
              <div style={{ fontSize: 12, color: "var(--fg-muted, #888)", lineHeight: 1.5 }}>
                On your second device: open Telegram → Settings → Devices → Link Desktop Device → scan this code.
              </div>
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
            <button type="button" onClick={requestQr} disabled={busy}>Try again</button>
          )}
        </>
      )}

      {/* ── Via CryptBot ── */}
      {mode === "bot" && (
        <>
          {linkStatus?.completed ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong>{linkStatus.providerDisplayName ?? "Connected"}</strong>
                <span className="chip green">Linked</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
                Linked via CryptBot — messages will route through the bot, not as direct user-to-user messages.
              </div>
            </div>
          ) : linkCode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong style={{ fontSize: 18 }}>{`LINK ${linkCode}`}</strong>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => navigator.clipboard?.writeText(`LINK ${linkCode}`)}
                >
                  Copy
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={cancelLink}>Cancel</button>
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
                Send this code to @CryptBot in Telegram to link your account. The app will open automatically.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {linkDeepMobile && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => { window.location.href = linkDeepMobile!; }}>
                    Open Telegram
                  </button>
                )}
                {linkDeepWeb && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => window.open(linkDeepWeb!, "_blank")}>
                    Open Telegram Web
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
                Waiting for you to send the code…
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => void startLink("telegram")} disabled={linkBusy}>
                {linkBusy ? "Generating…" : "Generate link code"}
              </button>
              <div style={{ fontSize: 12, color: "var(--fg-muted, #888)", lineHeight: 1.5 }}>
                Generates a code you send to @CryptBot in Telegram. Messages will route through the bot rather than as direct user-to-user messages.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
