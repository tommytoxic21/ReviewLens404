# ReviewLens404 — Review Ingestion

## Overview

This module implements Sprint 1 Issues S1-019 through S1-023.

It retrieves Google Maps reviews using SerpApi, normalizes them, persists them in PostgreSQL, and tracks ingestion attempts.

## Implemented Features

### S1-019 — Authenticated Review Ingestion

Provides the protected endpoint:

`POST /analysis-targets/:targetId/ingest`

- Requires Clerk authentication.
- Verifies that the AnalysisTarget exists and belongs to the authenticated user.
- Uses the Google Maps URL stored in the AnalysisTarget.
- Rejects unauthorized requests before accessing external review services.
- Returns ingestion status, attempt ID, and review counts.

### S1-020 — Review Retrieval

- Retrieves real Google Maps reviews using SerpApi.
- Uses Google Maps Place IDs or Data IDs.
- Supports shortened Google Maps sharing links through validated redirects.
- Rejects unsafe redirect destinations.
- Does not substitute fabricated reviews when external retrieval fails.
- Supports mocked HTTP responses for isolated tests.

### S1-021 — Review Normalization

- Converts source-specific review data into a canonical format.
- Requires nonempty review text and a valid integer rating from 1 to 5.
- Preserves available identifiers, reviewer information, dates, URLs, and metadata.
- Rejects malformed individual reviews without rejecting valid records in the same batch.

### S1-022 — PostgreSQL Review Persistence

- Persists normalized reviews using Drizzle ORM.
- Associates reviews with their AnalysisTargets.
- Enforces ownership when saving and retrieving reviews.
- Keeps review records isolated between AnalysisTargets.
- Deletes associated reviews when their parent AnalysisTarget is deleted.

### S1-023 — Ingestion Attempt Tracking

- Records ingestion attempts in PostgreSQL.
- Supports `processing`, `succeeded`, and `failed` statuses.
- Records received, saved, and rejected review counts.
- Records start and completion timestamps.
- Stores safe error messages and logs technical failures.
- Marks ingestion successful only after review persistence succeeds.
- Prevents completed attempts from being finalized a second time.

## Supported Google Maps URLs

The ingestion implementation supports:

- Google Maps place URLs containing embedded `data_id` values.
- Google Maps URLs containing embedded Place IDs.
- Google Maps search URLs containing `query_place_id`.
- Modern `maps.app.goo.gl` sharing links.
- Legacy `goo.gl/maps` sharing links.

Shortened URLs must redirect to an approved Google Maps destination containing a resolvable identifier.

