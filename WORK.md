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
