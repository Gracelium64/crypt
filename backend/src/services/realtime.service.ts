import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { MessageDocument } from "#models";

let io: Server | null = null;

const parseOrigins = (raw: string) => {
  if (raw.trim() === "*") return "*";
  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
};

export const initRealtime = (server: HttpServer, corsOrigin: string) => {
  io = new Server(server, {
    cors: {
      origin: parseOrigins(corsOrigin),
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.emit("system:status", { message: "realtime connected" });
  });
};

export const broadcastMessage = (message: MessageDocument) => {
  io?.emit("message:new", {
    id: message._id.toString(),
    accountId: message.accountId?.toString(),
    provider: message.provider,
    direction: message.direction,
    from: message.from,
    to: message.to,
    chatId: message.chatId,
    deliveryStatus: message.deliveryStatus,
    encryptedText: message.encryptedText,
    bodyOmitted: Boolean(message.bodyOmitted),
    attachments: message.attachments,
    createdAt: message.createdAt,
  });
};
