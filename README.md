# ReviewLens404

## Stack

- Frontend: React + TypeScript (Vite)
- Backend: Node.js + TypeScript + Fastify
- Database: PostgreSQL
- Managed identity: Clerk
- Supported review platform: Google Maps
- Review provider: SerpApi Google Maps APIs

## Prerequisites

- Node.js (LTS)
- PostgreSQL

## Setup

1. Clone the repo.
2. Install dependencies:
   - `cd frontend && npm install`
   - `cd backend && npm install`
3. Copy `backend/.env.example` to `backend/.env` and fill in your values.
4. Copy `frontend/.env.example` to `frontend/.env.local` and fill in your values.
5. Create the PostgreSQL databases named in `DATABASE_URL` and
   `TEST_DATABASE_URL`.
6. Apply backend database migrations with `cd backend && npm run db:migrate`.

Required backend configuration:

- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: Clerk backend credentials.
- `DATABASE_URL`: the application PostgreSQL database.
- `TEST_DATABASE_URL`: a separate disposable PostgreSQL test database.
- `SERPAPI_API_KEY`: server-side SerpApi credential for Google Maps review
  ingestion.
- `PORT`: optional; defaults to `3001`.

Required frontend configuration:

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk's browser-safe publishable key.

The browser calls the same-origin `/api` path. Local development uses Vite's
proxy; production hosting should route `/api` to the backend.

Never put `CLERK_SECRET_KEY`, `SERPAPI_API_KEY`, or database credentials in a
frontend environment variable. Only variables prefixed with `VITE_` are
delivered to browser code.

## Run locally

- Backend: `cd backend && npm run dev` (http://localhost:3001/health)
- Frontend: `cd frontend && npm run dev` (http://localhost:5173)

## Sprint 1 workflow

1. Sign in through Clerk.
2. Create an AnalysisTarget with an entity name and public Google Maps place
   URL. The platform is fixed to Google Maps.
3. Open the persisted target workspace.
4. Choose **Ingest from source URL**. The backend loads the target using the
   verified Clerk identity and uses the target's saved URL—not a URL or owner ID
   supplied to the ingestion request.
5. ReviewLens resolves the Google Maps place through SerpApi, normalizes only
   records that contain both review text and rating, persists useful source
   metadata, and records the attempt as `succeeded` or `failed`.

ReviewLens does not provide a manual or file-import fallback in Sprint 1. It
does not create sample reviews when the provider fails or returns unusable
records.

Protected API routes are under `/api`:

- `GET /analysis-targets`
- `POST /analysis-targets`
- `GET /analysis-targets/:targetId`
- `DELETE /analysis-targets/:targetId`
- `POST /analysis-targets/:targetId/ingestions`

Each protected request verifies a Clerk session token. All target, review, and
ingestion-attempt access is constrained by the authenticated owner on the
backend.

## Code quality and tests

Run these inside `frontend/` or `backend/`:

- Lint: `npm run lint`
- Format: `npm run format`, `npm run format:check`
- Tests: `npm test`

Frontend CI also requires 80% aggregate coverage for lines, functions,
branches, and statements, and 100% coverage of changed executable TypeScript
lines in `frontend/src`. Test files, `setupTests.ts`, mock files, and
non-TypeScript assets are excluded from the changed-code check; non-executable
lines do not count.
Run the frontend gate locally from `frontend/` after fetching the target branch:

```powershell
git fetch origin main
$env:BASE_SHA = git merge-base HEAD origin/main
npm run test:changed-coverage
```

Backend CI applies the same 80% aggregate thresholds and requires 100%
coverage of changed executable TypeScript lines in `backend/src`. Test files,
mock files, and non-TypeScript assets are excluded from the changed-code check.
Run the backend gate locally from `backend/` after fetching the target branch:

```powershell
git fetch origin main
$env:BASE_SHA = git merge-base HEAD origin/main
npm run test:changed-coverage
```

Backend database integration tests require `TEST_DATABASE_URL`. The test
database must be separate from the development database because the tests
delete their own AnalysisTarget records between cases. Provider tests use
deterministic mocks and never require a live SerpApi key.

Backend database commands:

- Generate a migration after changing the schema: `npm run db:generate`
- Apply committed migrations: `npm run db:migrate`

Tools: ESLint (lint), Prettier (formatting), Vitest (tests).
The frontend also uses React Testing Library and jsdom.
NOTE: TypeScript is pinned below 6.1 because typescript-eslint doesn’t support newer versions yet (this was a workaround - idk if it will cause issues for anyone [Daniel])

## Engineering standards

See engineering-standards.md for the project's conventions for contributors and AI coding assistants.

## Structure

- `frontend/`: React UI
- `backend/`: Fastify API
