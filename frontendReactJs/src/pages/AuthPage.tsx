import { useState } from "react";
import { useAuth } from "@/context";
import { OnboardingModal } from "@/components";
import "../styles/auth.css";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    <div className="app-shell auth-shell">
      <div className="auth-form auth-card">
        <h2 className="auth-title">Crypt</h2>

        <div className="auth-tab-bar">
          <button
            type="button"
            onClick={() => switchTab("signin")}
            className={`auth-tab${tab === "signin" ? " active" : ""}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchTab("signup")}
            className={`auth-tab${tab === "signup" ? " active" : ""}`}
          >
            Sign up
          </button>
        </div>

        {error && (
          <div className="auth-error">{error}</div>
        )}

        <div className="auth-field">
          <label>Email</label>
          <input
            type="text"
            inputMode="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
            autoComplete="email"
          />
          {emailError && <div className="auth-field-error">{emailError}</div>}
        </div>
        <div className="auth-field-pw">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
            autoComplete={tab === "signin" ? "current-password" : "new-password"}
          />
          {passwordError && <div className="auth-field-error">{passwordError}</div>}
        </div>

        <div className={`auth-forgot-row${tab !== "signin" ? " auth-forgot-row--hidden" : ""}`}>
          <button
            type="button"
            onClick={() => setForgotRevealed(true)}
            className="auth-forgot-btn"
          >
            Forgot password?
          </button>
          <div className={`auth-forgot-hint${forgotRevealed ? "" : " auth-forgot-hint--hidden"}`}>
            Sounds like a you problem
          </div>
        </div>

        <div className="auth-actions">
          {tab === "signin" ? (
            <button type="button" disabled={busy} onClick={handleLogin}>
              {busy ? <span className="spinner" /> : "Sign in"}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={handleRegister}>
              {busy ? <span className="spinner" /> : "Sign up"}
            </button>
          )}
        </div>
      </div>

      {/* ⁈ Help button — center bottom */}
      <button
        type="button"
        onClick={() => setOnboardingOpen(true)}
        className="auth-help-btn"
        aria-label="How to use Crypt"
      >
        ⁈
      </button>

      {onboardingOpen && <OnboardingModal onClose={() => setOnboardingOpen(false)} />}
    </div>
  );
}
