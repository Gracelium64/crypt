import { Router } from "express";
import { authenticate, validateBody } from "#middleware";
import {
  getMessages,
  getConversations,
  sendMessage,
  deleteConversation,
  deleteAllMessages,
} from "#controllers";
import { sendMessageSchema } from "#schemas";

export const messagesRouter = Router();

messagesRouter.get("/messages", authenticate, getMessages);
messagesRouter.get("/conversations", authenticate, getConversations);
messagesRouter.post("/messages/send", authenticate, validateBody(sendMessageSchema), sendMessage);
messagesRouter.delete("/messages/conversation", authenticate, deleteConversation);
messagesRouter.delete("/messages/all", authenticate, deleteAllMessages);
