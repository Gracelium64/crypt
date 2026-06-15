type Props = {
  onClose: () => void;
};

const steps: { title: string; body: string }[] = [
  {
    title: "1 · Create an account",
    body: "Sign up with your email and a password of at least 8 characters. Your credentials stay on the server — no third-party auth. Your password is also used to encrypt your private key for cross-device sync, so choose something you'll remember.",
  },
  {
    title: "2 · Connect Telegram",
    body: "Go to Settings → Connect Telegram. Enter your phone number and the verification code sent to your Telegram app (look for a message from the official Telegram account — not SMS). This links your real Telegram identity to Crypt via MTProto, so messages go directly between accounts without routing through a bot.",
  },
  {
    title: "3 · Connect WhatsApp",
    body: "Go to Settings → Connect WhatsApp → Generate link code. You'll get a code like \"LINK ABCD1234\". Tap Open WhatsApp to open a chat with the Crypt business number, then send that code. WhatsApp will confirm the link and your account is connected. On iPhone this opens the WhatsApp app directly; on Android use the web link.",
  },
  {
    title: "4 · Encryption keys",
    body: "A keypair is generated automatically on first sign-in and synced to the server encrypted with your password. On any new device, signing in with the same credentials restores your keys automatically — no manual export needed. To regenerate, go to Settings → Security & Keys → Generate New Keypair, but note that old messages will become unreadable.",
  },
  {
    title: "5 · Find contacts",
    body: "Use the 🔍 Find tab to search for contacts. For Telegram, search by @username. For WhatsApp, enter the phone number with country code (e.g. +4915207005318). Contacts who also use Crypt will show a key fingerprint — end-to-end encryption is available. Contacts without Crypt receive messages as plain text via the provider.",
  },
  {
    title: "6 · Send messages",
    body: "Open a conversation and pick a mode. Secure mode encrypts the message on your device — the server stores only ciphertext and only the recipient can decrypt it. Plain mode sends readable text, useful for contacts not on Crypt. Both modes work across Telegram and WhatsApp.",
  },
  {
    title: "7 · Nuke Account",
    body: "Tap the ☢️ icon in the top-left of the Chats view to permanently delete your account, all messages, keys, connections, and linked data. A 10-second countdown gives you time to cancel. This action is irreversible.",
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
