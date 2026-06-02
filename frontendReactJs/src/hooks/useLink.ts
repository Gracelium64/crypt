import { useEffect, useState } from "react";
import { apiFetch, apiJson } from "../lib/api";

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

      setLinkCode(j.data.code);
      setLinkProvider(j.data.provider);
      setLinkExpiresAt(j.data.expiresAt);
      setLinkStatus({ completed: false });
      setLinkDeepMobile(j.data.deepLinkMobile ?? null);
      setLinkDeepWeb(j.data.deepLinkWeb ?? null);

      try {
        navigator.clipboard?.writeText(`LINK ${j.data.code}`);
      } catch (e) {
        // ignore
      }

      try {
        const preferMobile =
          /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(
            navigator.userAgent || "",
          );
        const toOpen = preferMobile
          ? (j.data.deepLinkMobile ?? j.data.deepLinkWeb ?? null)
          : (j.data.deepLinkWeb ?? j.data.deepLinkMobile ?? null);
        if (toOpen) window.open(toOpen, "_blank");
      } catch (e) {
        // ignore
      }

      return j;
    } finally {
      setLinkBusy(false);
    }
  };

  const cancelLink = () => {
    setLinkCode(null);
    setLinkProvider(null);
    setLinkExpiresAt(null);
    setLinkStatus(null);
  };

  useEffect(() => {
    if (!linkCode) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const resp = await apiFetch(
          `/provider/link/status/${encodeURIComponent(linkCode)}`,
        );
        if (!resp.ok) return;
        const j = await resp.json();
        if (cancelled) return;
        const prev = linkStatus;
        setLinkStatus(j.data ?? null);
        if (j.data?.completed) {
          window.clearInterval(id);
          if (onComplete) onComplete(j.data);
        }
        if (!prev?.completed && j.data?.completed && onComplete) {
          onComplete(j.data);
        }
      } catch (err) {
        // ignore polling errors
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [linkCode]);

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
