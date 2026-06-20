import type { RequestHandler, Request } from "express";
import type { Types } from "mongoose";

type OwnedResource = {
  accountId?: Types.ObjectId | string | null;
  claimedAccountId?: Types.ObjectId | string | null;
};

type ResourceLoader = (req: Request) => Promise<OwnedResource | null>;

export const authorize = (getResource?: ResourceLoader): RequestHandler => {
  return async (req, _res, next) => {
    if (!req.account) {
      next(new Error("Unauthorized", { cause: { status: 401 } }));
      return;
    }

    if (!getResource) {
      next();
      return;
    }

    let resource: OwnedResource | null = null;
    try {
      resource = await getResource(req);
    } catch {
      next(new Error("Not found", { cause: { status: 404 } }));
      return;
    }

    if (!resource) {
      next(new Error("Not found", { cause: { status: 404 } }));
      return;
    }

    const owner = resource.claimedAccountId ?? resource.accountId;
    if (!owner || owner.toString() !== req.account.accountId) {
      next(new Error("Forbidden", { cause: { status: 403 } }));
      return;
    }

    next();
  };
};
