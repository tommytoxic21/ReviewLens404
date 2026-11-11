# Sprint 2 review-grounded Q&A (S2-010, S2-011, S2-012)

## Endpoint

`POST /api/analysis-targets/:targetId/questions` (requires Clerk session token)

```json
{ "question": "What do customers dislike?" }
```

The successful response contains `answer`, `status` (`answered` or
`insufficient_evidence`), `reviewsUsed`, and `totalReviews`.

- `400`: bad target ID, empty or over-500-character question.
- `401`: not authenticated.
- `404`: target absent or owned by a different user.
- `409`: selected target has no stored review evidence.
- `503`: OpenAI API key not configured.
- `502`: OpenAI unavailable or sent an unusable response.

## Architecture / security

The server resolves the user's Clerk identity, verifies target ownership, and
reads review content from PostgreSQL. The browser never supplies review context,
owner IDs, or target names to the LLM. No cross-request or cross-target review
state is cached. Tests exercise ownership and switching with distinct datasets.

**Context policy:** The latest 80 persisted reviews are considered, with up to
1,500 characters from each review and up to 30,000 total review-text characters.
The model receives a subset, not necessarily the entire dataset; answers must
avoid claims of exhaustive counts when context is truncated. For much larger
review datasets, add semantic retrieval or other targeted review selection.
No database schema changes or vector database are required.

No reviewer names, URLs, or raw metadata are included in the model prompt. The
prompt treats review text as untrusted evidence and instructs the model not to
follow commands embedded in reviews. The OpenAI API request sets `store: false`.

The service uses OpenAI's **Responses API** with strict structured output:
`{ status: 'answered' | 'insufficient_evidence', answer: string }`.
It will not fill in gaps from general knowledge. Scope-guard evaluation beyond
these rules remains part of S2-013..S2-016.

## Configuration and local use

In `backend/.env` (server-side only):

```dotenv
OPENAI_API_KEY=your_actual_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
```

Use a real OpenAI API key with available credits. **Never add it to `frontend`
or commit `.env`**. `OPENAI_MODEL` is optional. The app can start without
an OpenAI key, but Q&A returns `503` until configured.

From `backend/`: `npm run build`, `npm run lint`, `npm run format:check`,
`npm test` (DB tests need a separate `TEST_DATABASE_URL`). From `frontend/`:
`npm run build`, `npm run lint`, `npm run format:check`, `npm test`.

The local frontend's Vite proxy directs `/api` requests to port 3001.
Start the backend and frontend, sign in, ingest reviews into an owned target,
then ask a question from the target details page.

Automated tests use a mocked Q&A model and mocked OpenAI HTTP calls. No real
OpenAI requests or API charges are incurred by tests.
