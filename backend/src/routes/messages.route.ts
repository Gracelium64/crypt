import { Router } from "express";
import { authenticate, authorize, validateBody, validateQuery } from "#middleware";
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

messagesRouter.get("/messages", authenticate, authorize(), validateQuery(messagesQuerySchema), getMessages);
messagesRouter.get("/conversations", authenticate, authorize(), validateQuery(conversationsQuerySchema), getConversations);
messagesRouter.post("/messages/send", authenticate, authorize(), validateBody(sendMessageSchema), sendMessage);
messagesRouter.delete("/messages/conversation", authenticate, authorize(), validateQuery(deleteConversationQuerySchema), deleteConversation);
messagesRouter.delete("/messages/all", authenticate, authorize(), validateQuery(deleteAllMessagesQuerySchema), deleteAllMessages);
