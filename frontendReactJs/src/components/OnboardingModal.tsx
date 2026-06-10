type Props = {
  onClose: () => void;
};

const steps: { title: string; body: string }[] = [
  {
    title: "1 · Create an account",
    body: "Sign up with your email and a password of at least 8 characters. Your credentials stay on the server — no third-party auth.",
  },
  {
    title: "2 · Connect Telegram",
    body: "Go to Settings → Connect Telegram. Enter your phone number to link your Telegram account via MTProto (direct peer-to-peer, no bot required). This is what lets Crypt send and receive messages through your real Telegram identity.",
  },
  {
    title: "3 · Encryption keys",
    body: "A keypair is generated automatically on your first sign-in and registered to your account. You never need to do this manually. If you ever need a fresh keypair, go to Settings → Security & Keys → Generate New Keypair — but be aware that old messages will become unreadable once the key changes.",
  },
  {
    title: "4 · Find contacts",
    body: "Use the 🔍 Find tab to look up other Crypt users by their Telegram username or ID. Both users must have Crypt accounts and connected Telegram for end-to-end encrypted messaging to work.",
  },
  {
    title: "5 · Send messages",
    body: "Open a conversation and pick a mode before sending. Secure mode encrypts the message on your device before it leaves — only the recipient can read it. Plain mode sends readable text, useful when the other person isn't on Crypt.",
  },
  {
    title: "6 · Nuke Account",
    body: "Tap the ☢️ icon in the top-left of the Chats view to permanently delete your account, messages, keys, and all linked data. A 10-second countdown gives you time to cancel. This action is irreversible.",
  },
];

export default function OnboardingModal({ onClose }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--surface, #111827)",
          border: "1px solid var(--border, rgba(255,255,255,0.07))",
          borderRadius: "18px 18px 0 0",
          width: "100%",
          maxWidth: 480,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 20px 14px",
          borderBottom: "1px solid var(--border, rgba(255,255,255,0.07))",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text, #e2eaf6)" }}>How Crypt works</div>
            <div style={{ fontSize: 12, color: "var(--text-dim, #94aac4)", marginTop: 2 }}>End-to-end encrypted messaging</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-dim, #94aac4)",
              fontSize: 22,
              cursor: "pointer",
              lineHeight: 1,
              padding: "4px 6px",
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: "auto", padding: "16px 20px 32px", flex: 1 }}>
          {steps.map((step) => (
            <div
              key={step.title}
              style={{
                marginBottom: 20,
                background: "var(--surface2, #1a2337)",
                border: "1px solid var(--border, rgba(255,255,255,0.07))",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accent, #2ea6ff)",
                marginBottom: 6,
                letterSpacing: 0.2,
              }}>
                {step.title}
              </div>
              <div style={{
                fontSize: 14,
                color: "var(--text-dim, #94aac4)",
                lineHeight: 1.55,
              }}>
                {step.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
