import { Router } from "express";
import type { Request, Response } from "express";
import formidable from "formidable";
import fs from "fs/promises";
import { uploadBufferToCloudinary } from "../services/media.service.js";
import { env } from "../config/env.js";

export const uploadsRouter = Router();

// Accept a data URL (data:<mime>;base64,<data>) and upload to Cloudinary
uploadsRouter.post(
  "/uploads/base64",
  async (req: Request, res: Response): Promise<void> => {
    const dataUrl = req.body?.dataUrl;
    if (!dataUrl || typeof dataUrl !== "string") {
      res.status(400).json({ ok: false, error: "missing dataUrl" });
      return;
    }

    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ ok: false, error: "invalid dataUrl" });
      return;
    }

    const contentType = match[1];
    const b64 = match[2];
    const buffer = Buffer.from(b64, "base64");

    try {
      const url = await uploadBufferToCloudinary(buffer, "image", "uploads");
      res.status(201).json({ ok: true, url });
      return;
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  },
);

// Multipart upload: use Formidable to parse and upload file to Cloudinary
uploadsRouter.post(
  "/uploads/formidable",
  async (req: Request, res: Response): Promise<void> => {
    const form = formidable({ multiples: false });
    form.parse(req, async (err: any, fields: any, files: any) => {
      if (err) {
        res.status(400).json({ ok: false, error: err.message });
        return;
      }

      // Expect form field named 'file'
      const file = (files as any)?.file;
      if (!file) {
        res.status(400).json({ ok: false, error: "missing file field" });
        return;
      }

      try {
        const buffer = await fs.readFile(file.filepath ?? file.path);

        // Allow client to request a resource type (raw/image) via a form field
        const resourceType = (fields as any)?.resourceType ?? "image";
        const isEncryptedFlag =
          (fields as any)?.encrypted === "1" ||
          (fields as any)?.encrypted === "true";

        const url = await uploadBufferToCloudinary(
          buffer,
          resourceType,
          "uploads",
        );

        // Append a query marker so clients can detect encrypted uploads without server storing metadata
        const finalUrl = isEncryptedFlag ? `${url}?crypt=1` : url;

        res.status(201).json({ ok: true, url: finalUrl });
        return;
      } catch (uploadErr) {
        res.status(500).json({
          ok: false,
          error:
            uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
        });
        return;
      }
    });
  },
);

export default uploadsRouter;
