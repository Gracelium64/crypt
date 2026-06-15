import type { ReactNode } from "react";
import { useAuth } from "@/context";
import AuthPage from "@/pages/AuthPage";

type Props = {
  children: ReactNode;
};

export default function ProtectedLayout({ children }: Props) {
  const { checkSession, signedIn } = useAuth();

  if (checkSession) {
    return (
      <div className="app-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--muted)" }}>Loading…</span>
      </div>
    );
  }

  if (!signedIn) {
    return <AuthPage />;
  }

  return <>{children}</>;
}
