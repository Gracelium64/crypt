import { useCallback, useState } from "react";
import { apiJson } from "../lib/api";

export default function useConnections(authToken?: string | null) {
  const [connections, setConnections] = useState<any[]>([]);
  const [connectionsBusy, setConnectionsBusy] = useState(false);

  const loadConnectionsList = useCallback(async () => {
    if (!authToken) {
      setConnections([]);
      return;
    }
    setConnectionsBusy(true);
    try {
      const j = await apiJson("/provider/connections", {}, authToken);
      setConnections(j.data ?? []);
    } catch (err) {
      setConnections([]);
    } finally {
      setConnectionsBusy(false);
    }
  }, [authToken]);

  const submitConnectionToken = useCallback(
    async (connId: string, tokenValue: string, phoneNumberId?: string) => {
      if (!authToken) throw new Error("not authenticated");
      await apiJson(
        `/provider/connections/${encodeURIComponent(connId)}/credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: tokenValue,
            phoneNumberId: phoneNumberId || undefined,
          }),
        },
        authToken,
      );
      await loadConnectionsList();
    },
    [authToken, loadConnectionsList],
  );

  return {
    connections,
    connectionsBusy,
    loadConnectionsList,
    submitConnectionToken,
  };
}
