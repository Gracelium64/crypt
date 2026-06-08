import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// Serve raw OpenAPI JSON
router.get("/openapi.json", (_req, res) => {
  try {
    const specPath = path.resolve(process.cwd(), "backend/openapi.json");
    const raw = fs.readFileSync(specPath, "utf8");
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    res.status(500).json({ ok: false, error: "openapi spec not available" });
  }
});

// Simple HTML page that loads Swagger UI from CDN and points to /api/openapi.json
router.get("/docs", (_req, res) => {
  const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Crypt Companion API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function() {
        const ui = SwaggerUIBundle({
          url: '/api/openapi.json',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout'
        });
      }
    </script>
  </body>
  </html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
