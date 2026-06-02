#!/usr/bin/env node
// Test helper: upload a small payload via the backend base64 proxy (Cloudinary)
// Usage: node ./scripts/test-presign.js [serverUrl]

const server =
  process.argv[2] || process.env.API_BASE || "http://localhost:4000";

(async () => {
  try {
    console.log("Uploading via base64 proxy to", server);
    const payload = Buffer.from("hello from test-presign").toString("base64");
    const dataUrl = `data:text/plain;base64,${payload}`;
    const res = await fetch(`${server}/api/uploads/base64`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("Upload failed", json);
      process.exit(2);
    }

    console.log("Upload succeeded. Hosted URL:", json.url);
    process.exit(0);
  } catch (err) {
    console.error("Error in test-presign", err);
    process.exit(1);
  }
})();
