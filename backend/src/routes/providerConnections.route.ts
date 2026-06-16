import { Router } from "express";
import { authenticate, linkRateLimiter } from "#middleware";
import {
  getConnections,
  searchContact,
  resolveContact,
  deleteConnection,
} from "#controllers";

const providerConnectionsRouter = Router();

providerConnectionsRouter.get("/provider/connections", authenticate, getConnections);
providerConnectionsRouter.get("/provider/contact/search", linkRateLimiter, authenticate, searchContact);
providerConnectionsRouter.get("/provider/resolve", linkRateLimiter, authenticate, resolveContact);
providerConnectionsRouter.delete("/provider/connections/:id", authenticate, deleteConnection);

export default providerConnectionsRouter;
