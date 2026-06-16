import type { RequestHandler } from "express";
import formidable, { errors as formidableErrors } from "formidable";
import fs from "fs/promises";
import mime from "mime-types";
import { uploadBufferToCloudinary } from "#services";

const ALLOWED_RESOURCE_TYPES = new Set(["image", "raw"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Encrypted attachments (resourceType "raw") are ciphertext, not real files —
// they can never be meaningfully type-checked, so this list only applies to
// plain (unencrypted) uploads.
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

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

  const declaredMimeType = match[1];
  if (!ALLOWED_MIME_TYPES.has(declaredMimeType)) {
    next(new Error("Unsupported file type", { cause: { status: 400 } }));
    return;
  }

  try {
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      next(new Error("File too large (max 10MB)", { cause: { status: 400 } }));
      return;
    }
    const url = await uploadBufferToCloudinary(buffer, "image", "uploads");
    res.status(201).json({ ok: true, url });
  } catch (error) {
    next(error);
  }
};

export const uploadFormidable: RequestHandler = (req, res, next) => {
  const form = formidable({ multiples: false, maxFileSize: MAX_UPLOAD_BYTES });
  form.parse(req, async (err: unknown, fields: unknown, files: unknown) => {
    if (err) {
      const message = (err as { code?: number }).code === formidableErrors.biggerThanMaxFileSize
        ? "File too large (max 10MB)"
        : (err as Error).message ?? "Form parse failed";
      next(new Error(message, { cause: { status: 400 } }));
      return;
    }

    const file = (files as Record<string, unknown>)?.file;
    if (!file) {
      next(new Error("Missing file field", { cause: { status: 400 } }));
      return;
    }

    try {
      const filePath = (file as Record<string, string>).filepath ?? (file as Record<string, string>).path;
      const fieldsObj = fields as Record<string, unknown>;

      const requestedType = String(fieldsObj?.resourceType ?? "image");
      const resourceType = (ALLOWED_RESOURCE_TYPES.has(requestedType)
        ? requestedType
        : "image") as "image" | "raw";

      if (resourceType !== "raw") {
        const declaredMimeType = (file as Record<string, string>).mimetype;
        const originalFilename = (file as Record<string, string>).originalFilename;
        const mimeFromExtension = originalFilename ? mime.lookup(originalFilename) : false;
        const typeIsAllowed =
          (declaredMimeType ? ALLOWED_MIME_TYPES.has(declaredMimeType) : false) &&
          (mimeFromExtension ? ALLOWED_MIME_TYPES.has(mimeFromExtension) : true);
        if (!typeIsAllowed) {
          next(new Error("Unsupported file type", { cause: { status: 400 } }));
          return;
        }
      }

      const buffer = await fs.readFile(filePath);
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
