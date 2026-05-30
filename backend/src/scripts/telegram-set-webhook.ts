import { env } from "../config/env.js";

function usage() {
  console.log(
    "Usage: tsx ./src/scripts/telegram-set-webhook.ts --url <https://your.public/webhook>\n  or: tsx ./src/scripts/telegram-set-webhook.ts --delete",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

const deleteFlag = args.includes("--delete") || args.includes("-d");
const urlIndex = args.findIndex((a) => a === "--url" || a === "-u");
const url = urlIndex !== -1 ? args[urlIndex + 1] : undefined;

if (!env.TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set in environment");
  process.exit(2);
}

async function setWebhook(targetUrl: string) {
  const endpoint = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`;
  const body: Record<string, unknown> = { url: targetUrl };
  if (env.TELEGRAM_WEBHOOK_SECRET)
    body.secret_token = env.TELEGRAM_WEBHOOK_SECRET;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

async function deleteWebhook() {
  const endpoint = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`;
  const res = await fetch(endpoint, { method: "POST" });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

(async () => {
  try {
    if (deleteFlag) {
      await deleteWebhook();
      return;
    }

    if (!url) {
      console.error("Missing --url argument");
      usage();
    }

    await setWebhook(url!);
  } catch (error) {
    console.error("Error:", error);
    process.exit(3);
  }
})();
