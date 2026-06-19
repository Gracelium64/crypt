import { Router } from "express";
import { authenticate, requireAdmin, validateBody, linkRateLimiter } from "#middleware";
import { initLink, getLinkStatus, completeLink } from "#controllers";
import { initLinkSchema, completeLinkSchema } from "#schemas";

const linkRouter = Router();

linkRouter.post("/provider/link/init", authenticate, validateBody(initLinkSchema), initLink);
linkRouter.get("/provider/link/status/:code", authenticate, getLinkStatus);
linkRouter.post("/provider/link/complete", linkRateLimiter, requireAdmin, validateBody(completeLinkSchema), completeLink);

export default linkRouter;
