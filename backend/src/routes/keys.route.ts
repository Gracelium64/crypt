import { Router } from "express";
import { authenticate, authorize, validateBody } from "#middleware";
import { registerKey, getKey, getMyPrivateKey } from "#controllers";
import { registerKeySchema } from "#schemas";

const keysRouter = Router();

keysRouter.post("/keys/register", authenticate, authorize(), validateBody(registerKeySchema), registerKey);
keysRouter.get("/keys/me/private", authenticate, authorize(), getMyPrivateKey);
keysRouter.get("/keys/:ownerId", authenticate, getKey);

export default keysRouter;
