# ReviewLens404 Engineering Standards

This document describes the conventions developers and AI coding tools must follow when changing this codebase. It reflects what the repo actually does today. Items marked **(Team to confirm)** are proposed defaults that the team has not formally agreed on yet; confirm or edit them before relying on them.

## 1. Repository and folder organization

The repo is a monorepo with two independent npm packages. Each has its own `package.json`, lockfile, ESLint config, Prettier config and tests. Run commands from inside the package folder.

```
.github/workflows/     CI and automation (ci.yml, import-sprint-issues.yml)
backend/               Fastify + TypeScript API (ESM)
  src/app.ts           Builds and exports the Fastify app; no listen() call
  src/server.ts        Entry point; imports the app and starts listening
  src/*.test.ts        Unit tests, next to the code they cover
frontend/              Vite + React + TypeScript app
  src/main.tsx         App entry point
  src/App.tsx          Root component
  src/setupTests.ts    Vitest setup (jest-dom matchers)
  src/*.test.tsx       Component tests, next to the code they cover
DataSecurityGuardrails.txt   Data security rules; read before handling user data
Sprint1Issues.csv      Sprint issue definitions
```

Rules:
- Keep the app definition separate from the code that starts the server (`app.ts` vs `server.ts`) so tests can import the app without opening a port.
- Put tests beside the source file they test, named `<name>.test.ts` or `<name>.test.tsx`.
- Do not commit `.env` files, `node_modules/` or build output (`dist/`). Add new environment variables to the package's `.env.example` with placeholder values.
- Do not add code to the repo root other than shared documentation and workflow files.

## 2. Naming conventions

These match the existing files and are proposed as the standard:
- React component files: `PascalCase.tsx` (for example `App.tsx`).
- Non-component source files: `camelCase.ts` or single lowercase words (for example `app.ts`, `server.ts`).
- Test files: same name as the file under test plus `.test.ts` or `.test.tsx`.
- Variables and functions: `camelCase`. React components and TypeScript types/interfaces: `PascalCase`. Constants: `UPPER_SNAKE_CASE`.
- Environment variables: `UPPER_SNAKE_CASE`. Frontend variables exposed to the browser must use the `VITE_` prefix.
- Branches: `s1-NNN-short-description` (for example `s1-006-lint-and-tests`).

## 3. Formatting and linting

- Formatting is enforced by Prettier using the committed `.prettierrc` (`singleQuote: true`, `semi: true`) in each package. Do not rely on editor settings.
- Linting uses ESLint flat config with `@eslint/js` and `typescript-eslint` recommended rules. The frontend also uses the React Hooks and React Refresh plugins.
- Each package provides these scripts, and they are the only supported way to run the tools:
  - `npm run lint`
  - `npm run format` (rewrites files)
  - `npm run format:check` (fails if files are not formatted)
- Do not disable lint rules or add `eslint-disable` comments to get a change through. Fix the underlying issue or raise it with the team.
- `package-lock.json`, `node_modules` and `dist` are excluded from Prettier via `.prettierignore`.
- Pull requests must pass lint and format checks in CI before merging.

## 4. Error-handling conventions

- Backend: let Fastify's error handling produce responses. Throw errors (or use Fastify's `reply.code(...).send(...)`) with an appropriate HTTP status; do not swallow errors with empty `catch` blocks.
- Return client errors as 4xx and unexpected failures as 5xx. Never include stack traces, secrets or internal details in a response body.
- Frontend: handle failed requests explicitly and show the user a clear message instead of failing silently. Do not leave `catch` blocks that only `console.log`.

## 5. API and service response conventions

- Endpoints return JSON. The existing `GET /health` endpoint is the reference: it returns a small JSON object indicating status.
- Use standard HTTP status codes (200 success, 201 created, 400 invalid input, 401/403 auth failures, 404 not found, 500 unexpected error).
- Error responses use a consistent JSON shape with a human-readable message. The team should agree on the exact field names (for example `{ "error": "message" }`) and record them here.

## 6. Logging expectations

- The backend uses Fastify's built-in logger. Log through `app.log` or `request.log`, not `console.log`.
- Do not log secrets, tokens, passwords or personal data. Follow `DataSecurityGuardrails.txt`.
- Do not commit stray `console.log` debugging statements in either package.
- Use log levels appropriately (`info` for normal events, `warn` for recoverable problems, `error` for failures) **(Team to confirm)**.

## 7. Adding dependencies

- The project uses npm. Install packages from inside the correct package folder (`backend/` or `frontend/`) and commit both `package.json` and `package-lock.json`.
- CI installs with `npm ci`, so the lockfile must be committed and in sync with `package.json`.
- Keep the TypeScript version within the range already pinned in each `package.json`; the pin exists for compatibility with `typescript-eslint`. Do not upgrade it as a side effect of another change.
- Before adding a dependency, check whether the existing stack already covers the need. Explain new dependencies in the pull request description **(Team to confirm)**.
- Add runtime packages to `dependencies` and tooling (linters, test libraries, type packages) to `devDependencies`.

## 8. Testing new or changed behavior

- Tests use Vitest. Run them with `npm test` (which runs `vitest run` once and exits); never leave a watch-mode command in a script that CI calls.
- Every new or changed behavior needs an automated test in the same pull request.
- Backend tests exercise the app through Fastify's `inject()` so no server or network port is needed.
- Frontend tests use `jsdom` and Testing Library, and assert on visible behavior (roles, text) rather than implementation details. Mock third-party services such as Clerk (`vi.mock('@clerk/clerk-react', ...)`) so tests do not need real keys or network access.
- Tests must not require manual browser interaction or real secrets.
- CI (`.github/workflows/ci.yml`) runs on pull requests and pushes to `main`. For both `backend` and `frontend` it runs `npm ci`, `npm run format:check`, `npm run lint`, `npm run build` and `npm test`. A pull request should not be merged while these checks fail.
