import { Router } from "express";
import { authenticate, authorize, requireAdmin, validateBody, linkRateLimiter } from "#middleware";
import { initLink, getLinkStatus, completeLink } from "#controllers";
import { initLinkSchema, completeLinkSchema } from "#schemas";
import { Link } from "#models";

const linkRouter = Router();

linkRouter.post("/provider/link/init", authenticate, validateBody(initLinkSchema), initLink);
linkRouter.get(
  "/provider/link/status/:code",
  authenticate,
  authorize((req) => Link.findOne({ code: req.params.code }).lean()),
  getLinkStatus,
);
linkRouter.post("/provider/link/complete", linkRateLimiter, requireAdmin, validateBody(completeLinkSchema), completeLink);

export default linkRouter;
