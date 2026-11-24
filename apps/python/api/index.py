"""Vercel serverless entrypoint: re-exports the FastAPI app.

Vercel maps each file under `api/` to a serverless function; `vercel.json`
rewrites `/api/*` here so the FastAPI router (defined in `src.api`) owns
all API routes. Keep this file import-light: heavy deps (pandas/ccxt) are
lazy inside the service layer so the slim serverless install stays small.
"""

from src.api import app

__all__ = ["app"]
