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

## Run locally
- Backend: `cd backend && npm run dev` (http://localhost:3001/health)
- Frontend: `cd frontend && npm run dev` (http://localhost:5173)

## Code quality and tests
Run these inside `frontend/` or `backend/`:
- Lint: `npm run lint`
- Format: `npm run format`, `npm run format:check`
- Tests: `npm test`

Tools: ESLint (lint), Prettier (formatting), Vitest (tests).
The frontend also uses React Testing Library and jsdom.
NOTE: TypeScript is pinned below 6.1 because typescript-eslint doesn’t support newer versions yet (this was a workaround - idk if it will cause issues for anyone [Daniel])

## Structure
- `frontend/`: React UI
- `backend/`: Fastify API