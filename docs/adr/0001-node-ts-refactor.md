# ADR 0001: Migration from Python/Streamlit to Node.js/TypeScript

## Status

Accepted

## Context

The legacy application was built using Python, FastAPI, and Streamlit. While effective for initial prototyping, Streamlit enforces a computational model where user interactions trigger full-script re-executions. Furthermore, streaming real-time news payloads, calculating multiple cryptographic digests, and serving concurrent dashboard clients strained Python's GIL and synchronous execution loops under high I/O concurrency.

## Decision

Refactor the architecture to a decoupled Node.js (v20+ LTS) backend and a React/TypeScript Single Page Application:

- Use Node.js for high-concurrency, non-blocking I/O event-driven workflows.
- Implement strict TypeScript configs across a pnpm monorepo to prevent data-loss runtime bugs.
- Decouple the presentation layer completely via REST APIs and WebSockets.

## Consequences & Trade-offs

- **Pros:** Eliminates UI redraw lag; enables predictable event loop concurrency for multi-client scans; shared TypeScript contracts between API and client.
- **Cons:** Loss of rapid Python-specific scientific libraries; requires explicit thread offloading for heavy CPU operations.

## Rejected Alternatives

- **Keeping Streamlit with Caching (`st.cache_data`):** Rejected due to fundamental UI state synchronization limits and lack of fine-grained DOM control.
- **Go / Golang Rewrite:** Rejected to maintain end-to-end fullstack TypeScript developer ergonomics and code sharing with the React frontend.
