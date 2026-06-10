import type { RequestHandler } from "express";
import formidable from "formidable";
import fs from "fs/promises";
import { uploadBufferToCloudinary } from "#services";

const ALLOWED_RESOURCE_TYPES = new Set(["image", "raw"]);

export const uploadBase64: RequestHandler = async (req, res, next) => {
  const dataUrl = req.body?.dataUrl;
  if (!dataUrl || typeof dataUrl !== "string") {
    next(new Error("Missing dataUrl", { cause: { status: 400 } }));
    return;
  }

  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    next(new Error("Invalid dataUrl format", { cause: { status: 400 } }));
    return;
  }

  try {
    const buffer = Buffer.from(match[2], "base64");
    const url = await uploadBufferToCloudinary(buffer, "image", "uploads");
    res.status(201).json({ ok: true, url });
  } catch (error) {
    next(error);
  }
};

export const uploadFormidable: RequestHandler = (req, res, next) => {
  const form = formidable({ multiples: false });
  form.parse(req, async (err: unknown, fields: unknown, files: unknown) => {
    if (err) {
      next(new Error((err as Error).message ?? "Form parse failed", { cause: { status: 400 } }));
      return;
    }

    const file = (files as Record<string, unknown>)?.file;
    if (!file) {
      next(new Error("Missing file field", { cause: { status: 400 } }));
      return;
    }

    try {
      const filePath = (file as Record<string, string>).filepath ?? (file as Record<string, string>).path;
      const buffer = await fs.readFile(filePath);
      const fieldsObj = fields as Record<string, unknown>;

      const requestedType = String(fieldsObj?.resourceType ?? "image");
      const resourceType = (ALLOWED_RESOURCE_TYPES.has(requestedType)
        ? requestedType
        : "image") as "image" | "raw";

      const isEncryptedFlag =
        fieldsObj?.encrypted === "1" || fieldsObj?.encrypted === "true";

      const url = await uploadBufferToCloudinary(buffer, resourceType, "uploads");
      const finalUrl = isEncryptedFlag ? `${url}?crypt=1` : url;

      res.status(201).json({ ok: true, url: finalUrl });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
};
