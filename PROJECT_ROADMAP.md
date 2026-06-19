# Crypt Companion Project Roadmap

> **Current project status (as of 2026-06-20):**
> The app is feature-complete and deployed on Render. All Stage 6 items below that are ✅ were implemented
> during the project; items marked 🔜 are planned post-deadline.
> Refactor Pass 1 was completed 2026-06-20 on branch `dev/grace-slop-refactor`.
> This document remains useful as a learning roadmap — read stages 1-5 to understand the architecture.

## 1. Project Overview

**Crypt Companion** is a demo messaging app with:

- Backend: Node.js + TypeScript + Express + MongoDB + Socket.IO
- Frontend: React + TypeScript + Vite
- Key concepts: realtime updates, webhook-driven provider events, secure messages, file uploads, and cross-provider linking.

This repo contains:

- `backend/` — API server, webhook handlers, database models, encryption service, media uploads
- `frontendReactJs/` — React web app companion UI
- `docs/` — learner and maintainer guides

## 2. Learning Roadmap

### Stage 1: Understand the project and setup

1. Read `README.md` and `docs/LEARNER_GUIDE.md`.
2. Install dependencies and run the app locally:
   - `cd backend && npm install && npm run dev`
   - `cd frontendReactJs && npm install && npm run dev`
3. Review environment setup:
   - `backend/.env.example`
   - `VITE_API_BASE_URL` in frontend.
4. Learn the high-level data flow:
   - inbound webhook → backend normalization → MongoDB storage → Socket.IO emit → React update
   - websocket fallback polling when realtime is unavailable.

### Stage 2: Backend fundamentals

1. Start with `backend/src/server.ts`:
   - Express app bootstrap
   - middleware setup
   - route registration
   - Socket.IO initialization
2. Study backend folders:
   - `src/routes/` — API and webhook endpoints
   - `src/models/` — MongoDB schemas and persistence models
   - `src/services/` — business logic: crypto, media, realtime, provider adapters
   - `src/db/connect.ts` — MongoDB connection logic
3. Learn core backend features:
   - `messages.route.ts` — send/read messages and provider interactions
   - `providers.route.ts` — provider readiness and webhook handlers
   - `uploads.route.ts` and `media.service.ts` — file upload, Cloudinary integration
   - `crypto.service.ts` — encryption and decryption helpers
4. Practice exercises:
   - add a new query param to `/api/messages`
   - add a message status field (`queued`, `sent`, `failed`)
   - create a new protected admin route

### Stage 3: Frontend fundamentals

1. Start with `frontendReactJs/src/App.tsx`:
   - app layout
   - socket lifecycle management
   - polling fallback
   - message send flow
2. Review the main UI components:
   - `Composer.tsx` — message composer and send controls
   - `ConnectionsPanel.tsx` — provider/inbox navigation
   - `SelectedConversationPanel.tsx` — message timeline and conversation details
   - `KeyManager.tsx` — encryption key flow
   - `LinkWizard.tsx` — provider linking flow
3. Understand React hooks and services:
   - `src/hooks/` — stateful logic for connections, conversations, provider linking, realtime
   - `src/services/` — API wrappers for keys and messages
   - `src/lib/crypto.ts` — client-side crypto utilities, if used
4. Practice exercises:
   - add a sent/received filter in the UI
   - add a typing indicator state
   - improve error handling for API calls

### Stage 4: Full stack integration

1. Connect frontend and backend:
   - inspect `frontendReactJs/src/lib/api.ts`
   - verify `VITE_API_BASE_URL` and CORS settings
2. Test the realtime experience:
   - open app and watch socket connection
   - simulate backend message events
3. Work with webhooks and provider flows:
   - understand webhook endpoints in `backend/src/routes/providers.route.ts`
   - learn `backend/src/scripts/telegram-set-webhook.ts`
   - use ngrok/localtunnel if testing webhooks locally
4. Validate file upload pipeline:
   - browser upload in frontend → backend `/api/uploads` route → Cloudinary
   - fallback base64 upload if multipart is unavailable

### Stage 5: Deployment and maintenance

1. Read `docs/MAINTAINER_GUIDE.md` and `docs/DEPLOYMENT.md`.
2. Understand deployment concerns:
   - backend env vars: MongoDB URI, CORS origin, demo encryption key, provider tokens, Cloudinary credentials
   - frontend env vars: `VITE_API_BASE_URL`
3. Learn runtime checks:
   - backend health endpoint
   - MongoDB connectivity
   - Socket.IO origin support
4. Add monitoring and resiliency:
   - log socket disconnects
   - validate webhook event sources
   - confirm media upload failures are retried or surfaced to the UI

### Stage 6: Extend the project

1. ✅ Replace placeholder provider adapters with real Telegram/WhatsApp outbound logic (Telegram MTProto + Bot API + WhatsApp Cloud API all live)
2. ✅ Add authentication and authorization middleware (JWT + `authenticate` middleware on all protected routes; login lockout; rate limiting)
3. 🔜 Add more robust conversation grouping and filtering
4. 🔜 Add test coverage for backend routes and frontend components
5. ✅ Build a production-ready static frontend deployment (deployed on Render as Static Site)

## 3. File Structure Guide

### Root files

- `.env.example` — template environment variables for backend
- `README.md` — quick start and project overview
- `docs/` — developer and deployment documentation
- `backend/` — server code and API logic
- `frontendReactJs/` — React web app

### Backend structure

- `backend/Dockerfile`
- `backend/openapi.json`
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/src/server.ts` — app entrypoint
- `backend/src/config/env.ts` — environment variable parsing
- `backend/src/db/connect.ts` — MongoDB connection helper
- `backend/src/models/`:
  - `account.ts`
  - `key.ts`
  - `link.ts`
  - `message.ts`
  - `providerConnection.ts`
- `backend/src/routes/`:
  - `admin.route.ts`
  - `auth.route.ts`
  - `keys.route.ts`
  - `link.route.ts`
  - `messages.route.ts`
  - `providerConnections.route.ts`
  - `providers.route.ts`
  - `swagger.route.ts`
  - `uploads.route.ts`
- `backend/src/scripts/telegram-set-webhook.ts`
- `backend/src/services/`:
  - `crypto.service.ts`
  - `media.service.ts`
  - `providers.service.ts`
  - `realtime.service.ts`
  - `secret.service.ts`
- `backend/src/types/custom.d.ts`

### Frontend structure

- `frontendReactJs/package.json`
- `frontendReactJs/tsconfig.json`
- `frontendReactJs/vite.config.ts`
- `frontendReactJs/index.html`
- `frontendReactJs/src/main.tsx` — app bootstrap
- `frontendReactJs/src/App.tsx` — main page and routing
- `frontendReactJs/src/App.css` — app styling
- `frontendReactJs/src/lib/api.ts` — API client
- `frontendReactJs/src/lib/crypto.ts` — client crypto logic
- `frontendReactJs/src/components/`:
  - `Composer.tsx`
  - `ConnectionsPanel.tsx`
  - `KeyManager.tsx`
  - `LinkWizard.tsx`
  - `OnboardingPanel.tsx`
  - `SelectedConversationPanel.tsx`
  - `Timeline.tsx`
- `frontendReactJs/src/context/`:
  - `auth-context.ts`
  - `AuthProvider.tsx`
  - `useAuth.ts`
- `frontendReactJs/src/hooks/`:
  - `useConnections.ts`
  - `useConversations.ts`
  - `useLink.ts`
  - `useProviders.ts`
  - `useRealtime.ts`
  - `useSend.ts`
- `frontendReactJs/src/services/`:
  - `keys.ts`
  - `messages.ts`
- `frontendReactJs/src/types/` and `types.ts`

## 4. Learning Path Recommendations

1. Start by running the local dev servers and exploring the UI.
2. Focus on backend routes first, then frontend components.
3. Build from small changes: add a route, then wire it through the client.
4. Keep docs handy: `docs/LEARNER_GUIDE.md` explains architecture, `docs/MAINTAINER_GUIDE.md` explains runtime and deployment.
5. Practice by adding a feature or fixing a bug, then test the full flow.

## 5. 7-Day Study Plan

### Day 1: Setup and exploration

- Install Node dependencies in `backend/` and `frontendReactJs/`.
- Start both dev servers.
- Open the web app and confirm it connects to the backend.
- Read `README.md` and `docs/LEARNER_GUIDE.md`.
- Sketch the main data path on paper: frontend → API → DB → realtime.

### Day 2: Backend architecture

- Read `backend/src/server.ts` end to end.
- Open each route file in `backend/src/routes/` and note its purpose.
- Read `backend/src/db/connect.ts` and one model file, such as `message.ts`.
- Run the backend build: `cd backend && npm run build`.

### Day 3: Backend feature deep dive

- Trace the message flow through `messages.route.ts`.
- Read `backend/src/services/crypto.service.ts` and `media.service.ts`.
- Add a small backend change: return `status` from `/api/messages` and test it.
- Review `backend/src/routes/providers.route.ts` and webhook handling.

### Day 4: Frontend architecture

- Read `frontendReactJs/src/App.tsx` and understand the page layout.
- Open the main components: `Composer.tsx`, `ConnectionsPanel.tsx`, `SelectedConversationPanel.tsx`.
- Inspect `src/hooks/useRealtime.ts` and `src/lib/api.ts`.
- Add a minor UI enhancement: display a “last updated” timestamp or a simple filter.

### Day 5: Full stack integration

- Verify the frontend calls backend endpoints successfully.
- Inspect browser network traffic for `/api/messages` and socket connections.
- Change one frontend API call and confirm the backend receives it.
- If possible, simulate an inbound provider message and watch the UI update.

### Day 6: Practical feature build

- Choose one feature from the roadmap exercises.
- Example: add a message delivery status field and show it in the UI.
- Implement the backend data change, update the API response, and wire the frontend.
- Test end-to-end and document the change.

### Day 7: Deployment readiness and review

- Read `docs/MAINTAINER_GUIDE.md` and `docs/DEPLOYMENT.md`.
- Confirm environment variables are understood and documented.
- Build backend and frontend for production.
- Write a short summary of what you learned and next extension ideas.

## 6. Best Practices for Maintenance

- Keep environment secrets private and out of source control.
- Use the same `DEMO_ENCRYPTION_KEY` for backend encryption-related flows during local testing.
- Confirm CORS origins and API base URL are aligned between frontend and backend.
- Add retry handling and user feedback for network failures.
- Evaluate whether provider webhook logic should be isolated into reusable adapter functions.
- Document any new routes or env vars in `docs/MAINTAINER_GUIDE.md`.

---

> This roadmap is designed to help you grow from a student learner into the person who can understand, maintain, and extend the Crypt Companion stack.
