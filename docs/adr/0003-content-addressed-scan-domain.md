# ADR 0003: Content-Addressed Identity for Ingestion and Scans

## Status

Accepted

## Context

The Python application ingested articles, user files, and indicators without a canonical deduplication mechanism, storing redundant payloads and risking repeated CPU-heavy re-scans of identical data.

## Decision

Implement a **Content-Addressed Storage & Identification Architecture**:

- Every ingested file, news payload, or raw asset input receives a unique `SHA-256` identity hash computed immediately upon arrival.
- All subsequent database references, deduplication checks, and blocklist evaluations use this digest as the primary key/index.
- Hashing is processed via native `node:stream` pipelines to keep memory footprints constant (<64KB per chunk).

## Consequences & Trade-offs

- **Pros:** Instant $O(1)$ duplicate rejection; blocklist checks become indexed hash lookups; verifiable audit integrity.
- **Cons:** Requires hashing overhead on every write, requiring streaming to prevent Event Loop starvation.

## Rejected Alternatives

- **Database Sequence Auto-Increment IDs:** Rejected because duplicate payloads receive different IDs, bloating disk storage and forcing duplicate scans.
