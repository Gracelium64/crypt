import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { env } from "../config/env.js";

if (
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

export const uploadBufferToCloudinary = async (
  buffer: Buffer,
  resourceType: "raw" | "image" | "auto" | "video" = "image",
  folder = "uploads",
) => {
  if (!env.CLOUDINARY_CLOUD_NAME)
    throw new Error("CLOUDINARY_CLOUD_NAME not configured");

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder },
      (error: any, result: any) => {
        if (error) return reject(error);
        if (!result || !result.secure_url)
          return reject(new Error("upload failed"));
        resolve(result.secure_url);
      },
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

export const downloadAndUploadWhatsappMedia = async (mediaId: string) => {
  if (!env.WHATSAPP_ACCESS_TOKEN)
    throw new Error("WHATSAPP_ACCESS_TOKEN not configured");
  if (!env.CLOUDINARY_CLOUD_NAME) throw new Error("CLOUDINARY not configured");

  // 1) Get media URL from WhatsApp Graph API
  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!metaRes.ok)
    throw new Error(`Failed to fetch media metadata: ${metaRes.status}`);
  const meta = await metaRes.json();
  const mediaUrl = meta.url ?? meta["url"];
  if (!mediaUrl) throw new Error("Media URL not found in Graph API response");

  // 2) Download the media bytes
  const mediaRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!mediaRes.ok)
    throw new Error(`Failed to download media: ${mediaRes.status}`);
  const arrayBuffer = await mediaRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType =
    mediaRes.headers.get("content-type") ??
    meta.mime_type ??
    "application/octet-stream";

  // 3) Upload to Cloudinary
  const hostedUrl = await uploadBufferToCloudinary(buffer, "image", "whatsapp");
  return hostedUrl;
};
