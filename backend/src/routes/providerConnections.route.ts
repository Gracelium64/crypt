import { Router } from "express";
import { authenticate } from "#middleware";
import {
  getConnections,
  searchContact,
  resolveContact,
  deleteConnection,
} from "#controllers";

const providerConnectionsRouter = Router();

providerConnectionsRouter.get("/provider/connections", authenticate, getConnections);
providerConnectionsRouter.get("/provider/contact/search", searchContact);
providerConnectionsRouter.get("/provider/resolve", resolveContact);
providerConnectionsRouter.delete("/provider/connections/:id", authenticate, deleteConnection);

export default providerConnectionsRouter;
