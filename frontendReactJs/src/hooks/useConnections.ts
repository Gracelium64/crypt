import { useCallback, useState } from "react";
import { z } from "zod";
import { apiJson } from "../lib/api";
import type { Connection } from "../types";
import { ConnectionSchema } from "../schemas";

export default function useConnections(authToken?: string | null) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsBusy, setConnectionsBusy] = useState(false);

  const loadConnectionsList = useCallback(async () => {
    if (!authToken) {
      setConnections([]);
      return;
    }
    setConnectionsBusy(true);
    try {
      const j = await apiJson("/provider/connections", {}, authToken);
      const parsed = z.array(ConnectionSchema).safeParse(j.data ?? []);
      if (parsed.success) setConnections(parsed.data);
      else console.error("[Connections] response shape mismatch:", parsed.error);
    } catch (err) {
      console.error("[Connections] loadConnectionsList failed:", err);
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

  const deleteConnection = useCallback(
    async (connId: string) => {
      if (!authToken) throw new Error("not authenticated");
      await apiJson(
        `/provider/connections/${encodeURIComponent(connId)}`,
        { method: "DELETE" },
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
    deleteConnection,
  };
}
