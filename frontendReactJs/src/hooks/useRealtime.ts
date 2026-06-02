import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export default function useRealtime(
  onNewMessage: ((m: any) => void) | null,
  deps: any[] = [],
) {
  const [isRealtime, setIsRealtime] = useState(false);

  useEffect(() => {
    const socket: Socket = io();

    const onConnect = () => setIsRealtime(true);
    const onDisconnect = () => setIsRealtime(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (onNewMessage) {
      socket.on("message:new", onNewMessage);
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      if (onNewMessage) socket.off("message:new", onNewMessage);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { isRealtime };
}
