import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { apiBase } from "../lib/constants";
import type { ChatMessage } from "../types";

export default function useRealtime(accountId: string | null, onNewMessage: ((m: ChatMessage) => void) | null) {
  const [isRealtime, setIsRealtime] = useState(false);
  const callbackRef = useRef(onNewMessage);
  const accountIdRef = useRef(accountId);

  // Keep refs current without touching the socket
  useEffect(() => {
    callbackRef.current = onNewMessage;
  });

  useEffect(() => {
    accountIdRef.current = accountId;
  });

  useEffect(() => {
    const socket: Socket = io(apiBase);

    const onConnect = () => {
      setIsRealtime(true);
      if (accountIdRef.current) socket.emit("join:account", accountIdRef.current);
    };
    const onDisconnect = () => setIsRealtime(false);
    // Stable handler — always delegates to the latest callback
    const onMessage = (m: ChatMessage) => callbackRef.current?.(m);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onMessage);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onMessage);
      try { socket.close(); } catch { /* ignore */ }
    };
  }, []); // empty — socket is created once and never torn down due to callback churn

  return { isRealtime };
}
