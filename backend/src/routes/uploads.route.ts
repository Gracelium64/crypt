import { Router } from "express";
import { authenticate, authorize } from "#middleware";
import { uploadBase64, uploadFormidable } from "#controllers";

export const uploadsRouter = Router();

uploadsRouter.post("/uploads/base64", authenticate, authorize(), uploadBase64);
uploadsRouter.post("/uploads/formidable", authenticate, authorize(), uploadFormidable);
