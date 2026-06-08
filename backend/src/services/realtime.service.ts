import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { MessageDocument } from "#models";

let io: Server | null = null;

export const initRealtime = (server: HttpServer, corsOrigin: string) => {
  io = new Server(server, {
    cors: {
      origin: corsOrigin,
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
