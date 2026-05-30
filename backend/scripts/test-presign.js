#!/usr/bin/env node
// Test helper: request a presigned PUT URL from local backend and upload a small PNG buffer
// Usage: node ./scripts/test-presign.js [serverUrl]

const server =
  process.argv[2] || process.env.API_BASE || "http://localhost:4000";

(async () => {
  try {
    console.log("Requesting presign from", server);
    const res = await fetch(`${server}/api/uploads/presign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "test.txt", contentType: "text/plain" }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("Presign failed", json);
      process.exit(2);
    }

    const { uploadUrl, objectUrl } = json;
    console.log("Got uploadUrl, uploading sample payload...");

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: "hello from test-presign",
    });

    if (!putRes.ok) {
      console.error("PUT to signed URL failed", await putRes.text());
      process.exit(3);
    }

    console.log("Upload succeeded. Object available at:", objectUrl);
    process.exit(0);
  } catch (err) {
    console.error("Error in test-presign", err);
    process.exit(1);
  }
})();
