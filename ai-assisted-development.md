# AI-Assisted Development and Review

This document describes how the team prompts, reviews, tests and approves AI-assisted code before it is merged. **AI-generated code is treated as team-authored code.** The developer who submits it is responsible for it, and it is held to the same Definition of Done as any other change.

Items marked **(Team to confirm)** are proposed defaults the team has not formally agreed on yet. Confirm or edit them before relying on them.

## 1. AI tools the team expects to use

- **GitHub Copilot** (editor assistance and generated repository files such as `AGENTS.md`).
- **Claude** (chat-based help with code review, debugging, documentation and planning).
- Any other tool 

Tool output is a draft. No tool is trusted to decide whether code is correct, secure or ready to merge.

## 2. Context to supply to AI tools

Give the tool the context it needs to follow the team's conventions instead of guessing:

- The engineering standards in `engineering-standards.md` (folder layout, naming, formatting, error handling, logging, dependencies, testing). 
- The issue being worked on (its outcome and technical guidance) and the relevant existing files.
- The stack in use: TypeScript, Fastify (backend), Vite and React (frontend), Vitest, Prettier and ESLint, npm.
- The exact commands to run: `npm run lint`, `npm run format:check`, `npm run build` and `npm test`, from inside `backend/` or `frontend/`.
- The data rules in `DataSecurityGuardrails.txt`.

Never paste secrets, API keys, tokens, `.env` contents or real user data into a prompt.

## 3. Reviewing generated code

Before opening a pull request, the author reads every generated line and can explain it. Reviewers apply the same standard as for hand-written code. Check that the code:

- Does what the issue asks and nothing extra. Remove unrelated changes, unused code and leftover debugging statements.
- Follows `engineering-standards.md` (naming, error handling, logging, folder placement).
- Passes lint and format checks without disabling rules.
- Does not duplicate existing helpers or invent files, scripts or configuration that the project does not use.

The pull request description should say which parts were AI-assisted and which tool was used (optional)

## 4. Validating generated dependencies and APIs

AI tools can suggest packages, functions or API calls that do not exist, are outdated, or are unsafe. Before accepting any of them:

- Confirm that the package exists on npm, is actively maintained, and that its name is spelled exactly right.
- Confirm that every function, option or endpoint the code uses exists in the version actually installed. Check the official documentation, not the tool's description.
- Add new dependencies only according to the dependency rules in `engineering-standards.md`. Install them from the correct package folder and commit the lockfile.
- Reject dependencies that are not needed, or that duplicate something the stack already provides.

## 5. Required testing before accepting generated code

Generated code is not accepted until it has been run and tested:

- Add or update automated tests for every new or changed behavior, following the testing rules in `engineering-standards.md`.
- Run, from each affected package, `npm run format:check`, `npm run lint`, `npm run build` and `npm test`. All must pass locally.
- Run the app and exercise the changed behavior at least once; passing tests alone do not show that it works.
- The CI workflow must pass on the pull request. A failing required check blocks merge, and generated code gets no exception.
- Do not edit or delete existing tests just to make generated code pass.

## 6. Retaining AI session transcripts 
The team keeps a record of the AI sessions that shaped project code:

- Link the transcript from the pull request description.
- Remove secrets, keys, tokens and personal data from a transcript before it is committed.
- Transcripts are kept for the life of the project and are not deleted when the related pull request merges.

## 7. When generated code needs additional security review

A second reviewer, in addition to the normal review, must check generated code that touches:

- Authentication or authorization, including anything using Clerk.
- Secrets, environment variables or configuration files.
- User data, personal information, or anything covered by `DataSecurityGuardrails.txt`.
- Input handling or parsing, database or query construction, file access, or network requests to external services.
- New dependencies, or changes to `package.json` or lockfiles that add or upgrade packages.
- CI/CD workflows in `.github/workflows/`, or any change to permissions or access.

The pull request should name the security reviewer for these changes 

## Definition of Done

AI-assisted changes meet the team's existing Definition of Done in full: standards followed, tests added and passing, CI green, review approved, and documentation updated where behavior changed. 
