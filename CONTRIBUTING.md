# Contributing to ChainTelescope

Single-maintainer project; external PRs are welcome but reviewed asynchronously. There is no code of conduct — be professional in review threads.

## Setup

Follow [`docs/development.md`](docs/development.md) (Python) and [`AGENTS.md`](AGENTS.md) (quality gates for both stacks). The 5-minute version is in the [README Quick start](README.md#quick-start).

## Gates (run before every PR)

Python, from `apps/python/`:

```bash
python -m ruff check app.py src pages tests
python -m ruff format --check app.py src pages tests
python -m unittest discover -s tests -p 'test_*.py' -v
```

Node, from the repo root:

```bash
pnpm build && pnpm -r typecheck && pnpm -r lint && pnpm test
pnpm test:integration   # needs a DATABASE_URL
```

Docs: `node scripts/check-docs.mjs` must pass (links resolve, ADR/spec index complete).

## Commits and PRs

- [Conventional Commits](https://www.conventionalcommits.org/), lowercase imperative subject.
- Fill out [`.github/pull_request_template.md`](.github/pull_request_template.md); record validation (local run, CI, manual QA).
- One concern per PR. Update the docs your change affects (README, `docs/`, or `infra/README.md`).
- Never commit secrets, API keys, `.env` files, or Streamlit secrets. If you leak one, rotate it immediately — see [`docs/security/secrets.md`](docs/security/secrets.md).

## What not to send

- No pytest (unittest only), no new dependencies for a few lines, no speculative features.
- No edits to `packages/openapi/` (generated) or `CHANGELOG.md` (release-managed, except the `Unreleased` section when shipping).
