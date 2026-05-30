import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

const s3Client = () => {
  const region = env.AWS_REGION ?? "us-east-1";
  const clientConfig: any = { region };
  // If explicit credentials are provided, set them (useful for local dev)
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    clientConfig.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return new S3Client(clientConfig);
};

const guessExt = (contentType: string) => {
  const parts = contentType.split("/");
  if (parts.length < 2) return "bin";
  const subtype = parts[1].split(";")[0];
  // crude mapping for common image types
  if (subtype.includes("jpeg") || subtype.includes("jpg")) return "jpg";
  if (subtype.includes("png")) return "png";
  if (subtype.includes("gif")) return "gif";
  if (subtype.includes("webp")) return "webp";
  return subtype || "bin";
};

export const uploadBufferToS3 = async (
  buffer: Buffer,
  contentType: string,
  prefix = "whatsapp/",
) => {
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET not configured");

  const ext = guessExt(contentType || "application/octet-stream");
  const key = `${prefix}${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  const client = s3Client();
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read",
  });

  await client.send(cmd);

  const region = env.AWS_REGION ?? "us-east-1";
  const url = `https://${env.S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;
  return url;
};

export const downloadAndUploadWhatsappMedia = async (mediaId: string) => {
  if (!env.WHATSAPP_ACCESS_TOKEN)
    throw new Error("WHATSAPP_ACCESS_TOKEN not configured");
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET not configured");

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

  // 3) Upload to S3
  const hostedUrl = await uploadBufferToS3(buffer, contentType);
  return hostedUrl;
};
