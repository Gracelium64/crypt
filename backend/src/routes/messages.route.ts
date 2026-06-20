import { Router } from "express";
import { authenticate, validateBody, validateQuery } from "#middleware";
import {
  getMessages,
  getConversations,
  sendMessage,
  deleteConversation,
  deleteAllMessages,
} from "#controllers";
import {
  sendMessageSchema,
  messagesQuerySchema,
  conversationsQuerySchema,
  deleteConversationQuerySchema,
  deleteAllMessagesQuerySchema,
} from "#schemas";

export const messagesRouter = Router();

messagesRouter.get("/messages", authenticate, validateQuery(messagesQuerySchema), getMessages);
messagesRouter.get("/conversations", authenticate, validateQuery(conversationsQuerySchema), getConversations);
messagesRouter.post("/messages/send", authenticate, validateBody(sendMessageSchema), sendMessage);
messagesRouter.delete("/messages/conversation", authenticate, validateQuery(deleteConversationQuerySchema), deleteConversation);
messagesRouter.delete("/messages/all", authenticate, validateQuery(deleteAllMessagesQuerySchema), deleteAllMessages);
