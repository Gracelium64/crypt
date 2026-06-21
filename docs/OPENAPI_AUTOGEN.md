# Auto-generating OpenAPI from Zod Schemas

This doc covers migrating from the hand-written `backend/openapi.json` to a spec that is generated automatically from the existing Zod schemas using `@asteasolutions/zod-to-openapi`.

## Why bother

The hand-written spec drifts. Every new route or schema change requires a manual update to `openapi.json`. Auto-generation means the spec is always in sync with the actual validation layer.

## Package

```
@asteasolutions/zod-to-openapi  — extends Zod schemas with OpenAPI metadata
```

Check the publish date on npmjs.com before installing, then pin to the exact version:

```bash
# example — verify the version and date on npmjs.com first
npm install @asteasolutions/zod-to-openapi@7.3.3
```

## How it works

The library wraps Zod. You register each schema with `.openapi()` metadata, then pass them to a generator that produces the full OpenAPI 3.x JSON/YAML.

## Migration steps

### 1. Replace Zod imports in schema files

Change:
```ts
import { z } from "zod";
```
To:
```ts
import { z } from "@asteasolutions/zod-to-openapi";
```

All existing Zod APIs remain identical. The library re-exports everything from Zod and adds `.openapi()`.

### 2. Register schemas

Add `.openapi()` to each schema that needs a `$ref` in the spec. Example for `src/schemas/auth.ts`:

```ts
import { z } from "@asteasolutions/zod-to-openapi";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(24),
  displayName: z.string().optional(),
}).openapi("SignupBody");

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(24),
}).openapi("LoginBody");
```

You don't have to register every schema — only ones you want as named `$ref` components. Inline schemas work without `.openapi()`.

### 3. Create a generator script

Create `backend/src/scripts/generate-openapi.ts`:

```ts
import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { signupSchema, loginSchema } from "#schemas";
// import all other schemas...

const registry = new OpenAPIRegistry();

// Register reusable components
registry.register("SignupBody", signupSchema);
registry.register("LoginBody", loginSchema);

// Register each route
registry.registerPath({
  method: "post",
  path: "/auth/signup",
  tags: ["auth"],
  summary: "Sign up",
  request: { body: { content: { "application/json": { schema: signupSchema } } } },
  responses: { 200: { description: "OK" } },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["auth"],
  summary: "Login",
  request: { body: { content: { "application/json": { schema: loginSchema } } } },
  responses: { 200: { description: "OK" } },
});

// ... register remaining routes the same way

const generator = new OpenApiGeneratorV3(registry.definitions);

const doc = generator.generateDocument({
  openapi: "3.0.0",
  info: { title: "Crypt Companion API", version: "0.1.0" },
  servers: [{ url: "http://localhost:4000/api" }],
});

const outPath = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../openapi.json"
);

fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
console.log("openapi.json written to", outPath);
```

### 4. Add a build script

In `backend/package.json`, add under `"scripts"`:

```json
"generate:openapi": "tsx src/scripts/generate-openapi.ts"
```

Run it:

```bash
npm run generate:openapi
```

This overwrites `backend/openapi.json` with the generated spec.

### 5. Keep it in sync

Options (pick one):

- **Manual:** run `npm run generate:openapi` before every deploy. Add it to your deploy checklist in `docs/PRODUCTION_CHECKLIST.md`.
- **CI:** add a step that runs the script and commits the updated `openapi.json` if it changed.
- **Build hook:** prepend it to the `build` script: `"build": "npm run generate:openapi && tsc -p tsconfig.json"`.

## What you do NOT need to do

- You do not need to maintain `backend/openapi.json` by hand anymore — the script owns it.
- You do not need to change the `swagger.route.ts` — it still just reads and serves `openapi.json`.
- You do not need to install `swagger-ui-express` — the existing CDN approach still works.

## Trade-off vs. the hand-written approach

| | Hand-written (`openapi.json`) | Auto-generated |
|---|---|---|
| Setup | None | ~2–4 hours to migrate all routes |
| Drift risk | High — manual updates required | None — spec reflects actual schemas |
| Metadata control | Full, direct | Full, via `.openapi()` and `registerPath` |
| Runtime cost | Zero | Zero — spec is pre-generated at build time |
