import { useEffect, useState } from "react";
import { apiFetch, apiJson } from "../lib/api";

const SESSION_KEY = "crypt:pendingLink";

type SavedLink = {
  code: string;
  provider: string;
  expiresAt: string;
  deepLinkMobile: string | null;
  deepLinkWeb: string | null;
};

const isMobileDevice = () =>
  /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(
    navigator.userAgent || "",
  );

const savePending = (d: SavedLink) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
};

const clearPending = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
};

const loadPending = (): SavedLink | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const d: SavedLink = JSON.parse(raw);
    if (new Date(d.expiresAt) <= new Date()) {
      clearPending();
      return null;
    }
    return d;
  } catch {
    return null;
  }
};

export default function useLink(
  authToken?: string | null,
  onComplete?: (data: any) => void,
) {
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkProvider, setLinkProvider] = useState<string | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<any | null>(null);
  const [linkDeepMobile, setLinkDeepMobile] = useState<string | null>(null);
  const [linkDeepWeb, setLinkDeepWeb] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  // On mount, restore any pending link (survives page reload on mobile)
  useEffect(() => {
    const saved = loadPending();
    if (saved) {
      setLinkCode(saved.code);
      setLinkProvider(saved.provider);
      setLinkExpiresAt(saved.expiresAt);
      setLinkStatus({ completed: false });
      setLinkDeepMobile(saved.deepLinkMobile);
      setLinkDeepWeb(saved.deepLinkWeb);
    }
  }, []);

  const startLink = async (providerToLink: string) => {
    setLinkBusy(true);
    try {
      const j = await apiJson(
        "/provider/link/init",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: providerToLink }),
        },
        authToken,
      );

      const code: string = j.data.code;
      const provider: string = j.data.provider;
      const expiresAt: string = j.data.expiresAt;
      const deepLinkMobile: string | null = j.data.deepLinkMobile ?? null;
      const deepLinkWeb: string | null = j.data.deepLinkWeb ?? null;

      setLinkCode(code);
      setLinkProvider(provider);
      setLinkExpiresAt(expiresAt);
      setLinkStatus({ completed: false });
      setLinkDeepMobile(deepLinkMobile);
      setLinkDeepWeb(deepLinkWeb);

      savePending({ code, provider, expiresAt, deepLinkMobile, deepLinkWeb });

      try {
        navigator.clipboard?.writeText(`LINK ${code}`);
      } catch {
        // ignore
      }

      // Auto-open the provider:
      // - Mobile: navigate the SAME tab to tg:// so the browser stays alive
      //   and visibilitychange fires when the user returns from Telegram.
      //   Opening a new tab on mobile backgrounds THIS tab and freezes polling.
      // - Desktop: open web link in a new tab; original tab stays focused and
      //   polling continues uninterrupted.
      try {
        if (isMobileDevice()) {
          if (deepLinkMobile) window.location.href = deepLinkMobile;
        } else {
          if (deepLinkWeb) window.open(deepLinkWeb, "_blank");
        }
      } catch {
        // ignore
      }

      return j;
    } finally {
      setLinkBusy(false);
    }
  };

  const cancelLink = () => {
    clearPending();
    setLinkCode(null);
    setLinkProvider(null);
    setLinkExpiresAt(null);
    setLinkStatus(null);
  };

  useEffect(() => {
    if (!linkCode) return;
    let cancelled = false;
    let intervalId: number;

    const poll = async () => {
      if (cancelled) return;
      try {
        const resp = await apiFetch(
          `/provider/link/status/${encodeURIComponent(linkCode)}`,
        );
        if (!resp.ok || cancelled) return;
        const j = await resp.json();
        if (cancelled) return;
        setLinkStatus(j.data ?? null);
        if (j.data?.completed) {
          clearPending();
          window.clearInterval(intervalId);
          if (onComplete) onComplete(j.data);
        }
      } catch {
        // ignore polling errors
      }
    };

    intervalId = window.setInterval(poll, 2000);

    // Mobile browsers freeze timers when the tab is backgrounded (user switches
    // to Telegram app). Poll immediately on visibility restore so the UI reflects
    // completion as soon as the user returns to the browser.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [linkCode, onComplete]);

  return {
    linkCode,
    linkProvider,
    linkExpiresAt,
    linkStatus,
    linkDeepMobile,
    linkDeepWeb,
    linkBusy,
    startLink,
    cancelLink,
  };
}
