import "../styles/components/onboarding.css";

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
    body: "Go to Settings → Connect Telegram. Three options are available:\n\n1. Phone code — enter your number and the verification code that appears as a message from the official 'Telegram' account in your app (not SMS). This links your real identity for direct user-to-user messaging.\n\n2. QR code — generates a scannable code. You need a second device (computer or another phone) to scan it via Telegram → Settings → Devices → Link Desktop Device.\n\n3. Via CryptBot — the most reliable option. Generates a short code you send to @CryptBot in Telegram. Messages route through the bot rather than directly, but linking always works.",
  },
  {
    title: "3 · Connect WhatsApp",
    body: 'Go to Settings → Connect WhatsApp → Generate link code. You\'ll get a code like "LINK ABCD1234". Tap Open WhatsApp to open a chat with the Crypt business number, then send that code. WhatsApp will confirm the link and your account is connected. On iPhone this opens the WhatsApp app directly; on Android use the web link.',
  },
  {
    title: "4 · Encryption keys",
    body: "A keypair is generated automatically on first sign-in and synced to the server encrypted with your password. On any new device, signing in with the same credentials restores your keys automatically — no manual export needed. To regenerate, go to Settings → Security & Keys → Generate New Keypair, but note that old messages will become unreadable.",
  },
  {
    title: "5 · Find contacts",
    body: "Use the 🔍 Find tab to search for contacts. For Telegram, search by @username. For WhatsApp, enter the phone number with country code (e.g. +4915200000000). Contacts who also use Crypt will show a key fingerprint — end-to-end encryption is available. Contacts without Crypt receive messages as plain text via the provider.",
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
      className="ob-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ob-sheet">
        {/* Header */}
        <div className="ob-header">
          <div>
            <div className="ob-title">How Crypt works</div>
            <div className="ob-subtitle">End-to-end encrypted messaging</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ob-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="ob-scroll">
          {steps.map((step) => (
            <div key={step.title} className="ob-step">
              <div className="ob-step-title">{step.title}</div>
              <div className="ob-step-body">{step.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
