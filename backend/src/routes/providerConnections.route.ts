import { Router } from "express";
import { authenticate, authorize, requireAdmin, linkRateLimiter, validateQuery } from "#middleware";
import {
  getConnections,
  searchContact,
  resolveContact,
  deleteConnection,
} from "#controllers";
import { searchContactQuerySchema, resolveContactQuerySchema } from "#schemas";
import { ProviderConnection } from "#models";

const providerConnectionsRouter = Router();

providerConnectionsRouter.get("/provider/connections", authenticate, authorize(), getConnections);
providerConnectionsRouter.get("/provider/contact/search", linkRateLimiter, authenticate, validateQuery(searchContactQuerySchema), searchContact);
providerConnectionsRouter.get("/provider/resolve", requireAdmin, validateQuery(resolveContactQuerySchema), resolveContact);
providerConnectionsRouter.delete(
  "/provider/connections/:id",
  authenticate,
  authorize((req) => ProviderConnection.findById(req.params.id).lean()),
  deleteConnection,
);

export default providerConnectionsRouter;
