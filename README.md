# ReviewLens404

## Stack

- Frontend: React + TypeScript (Vite)
- Backend: Node.js + TypeScript + Fastify
- Database: PostgreSQL

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

## Run locally

- Backend: `cd backend && npm run dev` (http://localhost:3001/health)
- Frontend: `cd frontend && npm run dev` (http://localhost:5173)

## Code quality and tests

Run these inside `frontend/` or `backend/`:

- Lint: `npm run lint`
- Format: `npm run format`, `npm run format:check`
- Tests: `npm test`

Backend database integration tests require `TEST_DATABASE_URL`. The test
database must be separate from the development database because the tests
delete their own AnalysisTarget records between cases.

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
