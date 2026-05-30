import { Router } from "express";
import type { Request, Response } from "express";
import { uploadBufferToS3 } from "../services/media.service.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

export const uploadsRouter = Router();

// Accept a data URL (data:<mime>;base64,<data>) and upload to S3
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
      const url = await uploadBufferToS3(buffer, contentType);
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

export default uploadsRouter;

// Presign endpoint for direct browser uploads (PUT)
uploadsRouter.post(
  "/uploads/presign",
  async (req: Request, res: Response): Promise<void> => {
    const filename = req.body?.filename;
    const contentType = req.body?.contentType ?? "application/octet-stream";
    const prefix = req.body?.prefix ?? "uploads/";

    if (!filename || typeof filename !== "string") {
      res.status(400).json({ ok: false, error: "missing filename" });
      return;
    }

    if (!env.S3_BUCKET) {
      res.status(500).json({ ok: false, error: "S3_BUCKET not configured" });
      return;
    }

    // sanitize filename by replacing spaces
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

    const client = new S3Client({ region: env.AWS_REGION });
    const cmd = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: "public-read",
    });

    try {
      const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 900 });
      const objectUrl = `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
      res.status(200).json({ ok: true, uploadUrl, objectUrl, key });
      return;
    } catch (error) {
      res
        .status(500)
        .json({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      return;
    }
  },
);
