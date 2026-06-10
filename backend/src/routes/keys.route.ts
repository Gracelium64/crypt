import { Router } from "express";
import { authenticate, validateBody } from "#middleware";
import { registerKey, getKey } from "#controllers";
import { registerKeySchema } from "#schemas";

const keysRouter = Router();

keysRouter.post("/keys/register", authenticate, validateBody(registerKeySchema), registerKey);
keysRouter.get("/keys/:ownerId", getKey);

export default keysRouter;
