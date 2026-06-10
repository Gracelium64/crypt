import { useState } from "react";
import { useAuth } from "@/context";
import { OnboardingModal } from "@/components";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fieldError: React.CSSProperties = { color: "var(--red, #f55)", fontSize: 12, marginTop: 4 };

export default function AuthPage() {
  const auth = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [forgotRevealed, setForgotRevealed] = useState(false);

  const switchTab = (t: "signin" | "signup") => {
    setTab(t);
    setError(null);
    setEmailError(null);
    setPasswordError(null);
    setForgotRevealed(false);
  };

  const validate = () => {
    let ok = true;
    if (!emailRe.test(email.trim())) {
      setEmailError("Enter a valid email address");
      ok = false;
    }
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      ok = false;
    }
    return ok;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setBusy(true);
    setError(null);
    try {
      await auth.login({ email: email.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setBusy(true);
    setError(null);
    try {
      await auth.register({ email: email.trim(), password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="auth-form" style={{ width: "100%", maxWidth: 360, padding: "24px 16px" }}>
        <h2 style={{ marginBottom: 24, textAlign: "center" }}>Crypt</h2>

        <div style={{ display: "flex", marginBottom: 24, borderBottom: "1px solid var(--border, #333)" }}>
          <button
            type="button"
            onClick={() => switchTab("signin")}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              borderBottom: tab === "signin" ? "2px solid var(--accent, #fff)" : "2px solid transparent",
              color: tab === "signin" ? "var(--text, #fff)" : "var(--text-muted, #888)",
              padding: "8px 0",
              cursor: "pointer",
              fontWeight: tab === "signin" ? 600 : 400,
              marginBottom: -1,
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchTab("signup")}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              borderBottom: tab === "signup" ? "2px solid var(--accent, #fff)" : "2px solid transparent",
              color: tab === "signup" ? "var(--text, #fff)" : "var(--text-muted, #888)",
              padding: "8px 0",
              cursor: "pointer",
              fontWeight: tab === "signup" ? 600 : 400,
              marginBottom: -1,
            }}
          >
            Sign up
          </button>
        </div>

        {error && (
          <div style={{ color: "var(--red, #f55)", marginBottom: 12, fontSize: 14 }}>{error}</div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <input
            type="text"
            inputMode="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
            autoComplete="email"
          />
          {emailError && <div style={fieldError}>{emailError}</div>}
        </div>
        <div style={{ marginBottom: 20 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
          />
          {passwordError && <div style={fieldError}>{passwordError}</div>}
        </div>

        {tab === "signin" && (
          <div style={{ marginBottom: 16, fontSize: 13 }}>
            <button
              type="button"
              onClick={() => setForgotRevealed(true)}
              style={{ background: "none", border: "none", color: "var(--text-muted, #888)", cursor: "pointer", padding: 0, fontSize: 13 }}
            >
              Forgot password?
            </button>
            {forgotRevealed && (
              <div style={{ marginTop: 6, color: "var(--text-muted, #888)", fontStyle: "italic" }}>
                Sounds like a you problem
              </div>
            )}
          </div>
        )}

        <div className="auth-actions">
          {tab === "signin" ? (
            <button type="button" disabled={busy} onClick={handleLogin}>
              Sign in
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={handleRegister}>
              Sign up
            </button>
          )}
        </div>
      </div>

      {/* ⁈ Help button — center bottom */}
      <button
        type="button"
        onClick={() => setOnboardingOpen(true)}
        style={{
          position: "fixed",
          bottom: 32,
          left: "50%",
          transform: "translateX(-50%)",
          background: "none",
          border: "1px solid var(--border, rgba(255,255,255,0.07))",
          borderRadius: "50%",
          width: 42,
          height: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: "var(--text-dim, #94aac4)",
          fontSize: 18,
          lineHeight: 1,
        }}
        aria-label="How to use Crypt"
      >
        ⁈
      </button>

      {onboardingOpen && <OnboardingModal onClose={() => setOnboardingOpen(false)} />}
    </div>
  );
}
