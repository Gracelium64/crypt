import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export default function useRealtime(onNewMessage: ((m: any) => void) | null) {
  const [isRealtime, setIsRealtime] = useState(false);
  const callbackRef = useRef(onNewMessage);

  // Keep the ref current without touching the socket
  useEffect(() => {
    callbackRef.current = onNewMessage;
  });

  useEffect(() => {
    const socket: Socket = io();

    const onConnect = () => setIsRealtime(true);
    const onDisconnect = () => setIsRealtime(false);
    // Stable handler — always delegates to the latest callback
    const onMessage = (m: any) => callbackRef.current?.(m);

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
