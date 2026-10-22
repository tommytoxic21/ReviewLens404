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

## Structure
- `frontend/`: React UI
- `backend/`: Fastify API