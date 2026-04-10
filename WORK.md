# Echo Inventory — Work Log

---

## 2026-04-08 / Session 1

### Planning

- Defined the full application concept: organization-based inventory tracking with AI image capture
- Chose the tech stack:
  - **Frontend**: Next.js 15 (App Router), plain CSS, hosted on Vercel
  - **Infrastructure**: AWS CDK (TypeScript)
  - **Backend**: AWS Lambda (4 functions with internal routing)
  - **Database**: DynamoDB single table (`EchoInventory`)
  - **Storage**: S3 (image archiving)
  - **Auth**: AWS Cognito
  - **AI**: Amazon Nova Lite via AWS Bedrock (IAM auth, no API key)
  - **Local dev**: serverless-offline + LocalStack (S3 + DynamoDB)
- Designed the org model: owners sign up and create an org, owners add members by email, anonymous users can pick any org and submit a photo
- Designed the DynamoDB single-table schema (PK/SK patterns, GSI1 for public org listing)
- Decided on 4 Lambda functions with internal routing (orgs, inventory, members, image)
- Decided to use Bedrock Converse API (`ConverseCommand`) with `update_inventory` tool use for AI image processing
- Decided against Tailwind, react-hook-form, @tanstack/react-query — using native Next.js patterns

### Infrastructure (AWS CDK)

- Initialized CDK app in `infra/`
- Wrote **`AuthStack`** (`infra/lib/auth-stack.ts`):
  - Cognito UserPool (self-signup enabled, `custom:orgName` attribute)
  - Post-confirmation Lambda trigger → creates org in DynamoDB on email verification
  - UserPoolClient (SRP + password auth, 1hr access token, 30d refresh)
- Wrote **`StorageStack`** (`infra/lib/storage-stack.ts`):
  - DynamoDB table `EchoInventory` (PK/SK + GSI1 for org listing)
  - S3 bucket for image archiving (encrypted, public access blocked, IA lifecycle after 90 days)
- Wrote **`ApiStack`** (`infra/lib/api-stack.ts`):
  - API Gateway v2 HTTP API
  - Cognito JWT authorizer on all protected routes
  - 4 Lambda functions wired to routes
  - Public routes (no auth): `GET /public/orgs`, `POST /public/orgs/{orgId}/capture`
  - Protected routes: inventory CRUD, member management, authenticated image capture
  - IAM: DynamoDB per-function, S3 archive write, Bedrock `InvokeModel`, Cognito `AdminCreateUser`
- CDK deploys in order: StorageStack → AuthStack → ApiStack

### Lambda Functions

- Set up `functions/` npm workspace with TypeScript
- Wrote **`functions/shared/types.ts`**: `Org`, `OrgMember`, `UserOrgMembership`, `InventoryItem`, all API input/output types, Bedrock tool input shape
- Wrote **`functions/shared/db.ts`**: DynamoDB DocumentClient singleton, `getMembership()` helper
- Wrote **`functions/shared/auth.ts`**: JWT verification via `aws-jwt-verify`, `verifyAuth()`, `requireAuth()`, `okResponse()`, `errorResponse()`. Local dev bypasses JWT — any `Authorization: Bearer <userId>` string is accepted
- Wrote **`functions/orgs/index.ts`**: handles Cognito post-confirmation trigger (creates org + membership records) and `GET /public/orgs`
- Wrote **`functions/inventory/index.ts`**: `requireAuth()` + membership check on all routes, internal routing for list/create/update/delete
- Wrote **`functions/members/index.ts`**: `requireAuth()` + owner-only checks, Cognito `AdminCreateUser` for member invites
- Wrote **`functions/image/index.ts`**: routes public vs authenticated on `rawPath`, Bedrock Converse API with `update_inventory` tool use, quantity update/create logic, S3 archive. Local dev returns mock response

### Local Development

- Wrote **`docker-compose.yml`**: LocalStack with DynamoDB + S3 only
- Wrote **`serverless.yml`** (Serverless Framework v4): 4 functions with `{proxy+}` catch-all routes, `serverless-esbuild` for TypeScript hot reloading, `AWS_ENDPOINT_URL=http://localhost:4566` routes SDK calls to LocalStack
- Wrote **`scripts`** (root-level task runner):
  - `./scripts start` — starts LocalStack, seeds DynamoDB + S3, starts serverless-offline and Next.js dev server, Ctrl+C shuts everything down
  - `./scripts seed` — creates DynamoDB table + S3 bucket in LocalStack

### Frontend Foundation

- Initialized Next.js 15 in `frontend/` (App Router, TypeScript, plain CSS, no Tailwind)
- Wrote **`src/lib/auth.ts`**: `configureAmplify()`, `signIn`, `signUp`, `confirmSignUp`, `signOut`, `getAccessToken`
- Wrote **`src/lib/api.ts`**: typed API client — `api.inventory.*`, `api.members.*`, `api.orgs.*`, `api.image.*`. All calls go through `/api/proxy/*`
- Wrote **`src/app/api/proxy/[...path]/route.ts`**: Next.js catch-all reverse proxy — strips `/api/proxy` prefix, forwards to API Gateway (or `localhost:3001` locally)
- Wrote **`src/middleware.ts`**: protects all routes except `/login`, `/signup`, `/pantry/*`, `/api/*`
- Wrote **`src/app/amplify-provider.tsx`**: client component that calls `configureAmplify()` once on mount, placed in root layout

---

## 2026-04-09 / Session 2

### Bug Fixes

- **Proxy `content-encoding` stripping** — serverless-offline/Hapi compresses responses above ~1KB. Node's `fetch` decompresses automatically but the proxy was still forwarding the `Content-Encoding: gzip` header, causing `ERR_CONTENT_DECODING_FAILED` in the browser after 3+ inventory items. Fixed by dropping `content-encoding` in the generic proxy passthrough.
- **ECONNREFUSED on startup** — Next.js was starting before serverless-offline was bound to port 3001, causing the browser to fire API requests into nothing. Fixed in two ways: (1) proxy now catches connection errors and returns 503 instead of crashing, (2) `./scripts start` now waits for port 3001 to accept connections before starting Next.js.
- **`{proxy+}` path parameter mismatch** — serverless.yml uses `{proxy+}` as the catch-all path segment for inventory and member sub-routes. API Gateway puts the captured value in `params.proxy`, not `params.itemId` or `params.userId`. The Lambda was looking up the wrong key so DELETE and member removal always returned 404. Fixed with `params.itemId ?? params.proxy` and `params.userId ?? params.proxy` in the respective Lambdas.
- **LocalStack credentials leaking into Bedrock** — `./scripts` was exporting `AWS_ACCESS_KEY_ID=test` and `AWS_SECRET_ACCESS_KEY=test` globally, which overrode the real `naeem` profile credentials for all child processes including serverless-offline. Bedrock calls were rejected with `UnrecognizedClientException`. Fixed by scoping fake credentials to the LocalStack CLI alias only (`env AWS_ACCESS_KEY_ID=test ... aws ...`) and setting `AWS_PROFILE=naeem` explicitly when starting serverless-offline.
- **Mock response blocking Bedrock** — `processImage` had an early return for `IS_LOCAL=true` that always returned a fake item. Bedrock is real AWS and works from local. Removed the mock.

### Features

- **Brand field** — added `brand` (optional) to `InventoryItem`, `CreateItemInput`, `UpdateItemInput`, the Add Item form, and the Edit Item form.
- **Full item edit page** — replaced inline quantity-only editing with a dedicated `/inventory/[itemId]/edit` page that pre-fills and patches all fields: name, brand, category, quantity, unit, notes.
- **Delete confirmation modal** — replaced `window.confirm()` with a custom modal (overlay + card + Cancel/Delete buttons) in `InventoryList`.
- **Camera capture** — replaced `<input capture="environment">` (which skips the picker on mobile and does nothing on desktop) with `getUserMedia({ video: { facingMode: 'environment' } })`. Clicking "Take photo" triggers the browser permission prompt, then shows a live video preview with a Capture button. "Choose from library" still opens the file picker. Implemented in both `CaptureView` (authenticated) and `PublicCapture` (anonymous).
- **Image preview** — after capturing via camera or file picker, the image is shown during the "Analyzing…" state and on the results screen.
- **Public capture AI prompt** — the anonymous pantry flow now tells the AI the user is *taking* items, so it uses negative `quantity_delta` values. The authenticated flow prompt is unchanged (add or remove based on context).
- **Inventory context in AI prompt** — the current org inventory (names, quantities, units) is fetched before calling Bedrock and injected into the system prompt so the AI matches exact item names rather than inventing new ones. Plan to replace this with a `get_inventory` tool call as inventory grows.

### Local Dev Improvements

- **`./scripts start` startup order** — LocalStack, serverless-offline, and Next.js now start in the correct sequence: LocalStack → serverless-offline (wait for port 3001) → Next.js. LocalStack seeding runs in parallel and doesn't block the other processes.
- **Automatic DynamoDB backup/restore** — `./scripts start` restores from `.localstack-backup.json` after seeding on every startup. Ctrl+C triggers an automatic backup before stopping LocalStack. The backup file is gitignored.
- **`AWS_PROFILE=naeem`** — added to `.env` (auto-loaded by Serverless Framework) so the correct AWS profile is always used for Bedrock and Cognito without having to set it manually.
- **Select font size** — added `font-size: 1rem !important` to `<select>` inputs in AddItemForm and EditItemForm to override iOS Safari's system default which was rendering category/unit dropdowns too small on mobile.

### Architecture Notes

- The `{proxy+}` pattern in serverless.yml is correct for routing but all Lambdas using sub-resource routes must read `params.proxy` as the fallback for named path params.

### TODO

- **`get_inventory` Bedrock tool** — the current approach dumps the entire inventory as text into the system prompt on every image capture. This works for small inventories but gets unwieldy at 100+ items and will eventually hit token limits. The right fix is a `get_inventory` tool that the AI can call mid-conversation with a search term. Flow:
  1. AI receives the image
  2. AI calls `get_inventory` with a search term (e.g. "pinto beans")
  3. Lambda queries DynamoDB and returns matching items
  4. AI sees the exact names and quantities, then calls `update_inventory` with the correct name and delta

  This scales indefinitely — the AI only fetches what's relevant to the photo and the system prompt stays lean.

---

## Where We Are

The backend is fully written and the local dev environment is configured. The frontend foundation (auth, API client, proxy route, middleware) is in place. No pages exist yet beyond the Next.js default.

The local stack can be started with `./scripts start` once Docker is running. The CDK stacks are written and ready to deploy to AWS (`cdk deploy --all`) but have not been deployed yet — that should happen after the frontend is complete and Vercel is set up so the correct CORS origins and Cognito callback URLs can be configured.

---

## Where We Are Going

The goal is a deployed, working application where:
- A community pantry owner signs up, creates their org, and manages inventory
- Org members are invited by email and can log in to add/update inventory
- Anyone can walk up to a pantry, pick it from a list, take a photo of what they are taking, and the AI automatically updates the pantry inventory — no login required

---

## Pickup Point (Next Session)

**Start here:** write the frontend pages in this order:
1. `/signup` — email, password, org name form → `signUp()` → confirmation code screen → `confirmSignUp()` → redirect to `/login`
2. `/login` — email + password → `signIn()` → redirect to `/`
3. `/` — dashboard: org name, total items, recent activity, quick-action buttons
4. `/inventory` — list all org items, inline quantity edit, delete
5. `/inventory/add` — native form to create an item manually
6. `/inventory/capture` — mobile camera → base64 → AI → review confirmed/updated items
7. `/members` — list members, add by email (owner only)
8. `/pantry` — public org picker, no login required
9. `/pantry/[orgId]/capture` — public anonymous camera capture

After pages are done:
- Deploy CDK stacks to AWS
- Connect frontend to Vercel, set env vars
- Update CORS origins in `api-stack.ts` and Cognito callback URLs in `auth-stack.ts` with the Vercel URL
- End-to-end smoke test in production
