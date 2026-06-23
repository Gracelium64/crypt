import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { MessageDocument } from "#models";
import { parseOrigins } from "#config";
import { decryptSrvText } from "./crypto.service.js";

let io: Server | null = null;

export const initRealtime = (server: HttpServer, corsOrigin: string) => {
  io = new Server(server, {
    cors: {
      origin: parseOrigins(corsOrigin),
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.emit("system:status", { message: "realtime connected" });
    socket.on("join:account", (accountId: string) => {
      socket.join(`account:${accountId}`);
    });
  });
};

export const broadcastMessage = (message: MessageDocument) => {
  const accountId = message.accountId?.toString();
  if (!accountId) return;
  io?.to(`account:${accountId}`).emit("message:new", {
    id: message._id.toString(),
    accountId,
    provider: message.provider,
    direction: message.direction,
    from: message.from,
    to: message.to,
    chatId: message.chatId,
    deliveryStatus: message.deliveryStatus,
    encryptedText: decryptSrvText(message.encryptedText ?? ""),
    bodyOmitted: Boolean(message.bodyOmitted),
    attachments: message.attachments,
    createdAt: message.createdAt,
  });
};
