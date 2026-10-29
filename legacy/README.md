# Legacy Python Implementation (Reference Architecture)

This document outlines the operational and architectural guidelines for the legacy Python implementation (`app.py`, `src/`, `pages/`).

## 1. Freeze Policy
- **Read-Only / Reference Baseline:** As of Milestone 1, this Python codebase is strictly in maintenance mode (frozen).
- **No New Features:** All new features, performance optimizations, and domain logic must be developed inside the Node.js/TypeScript workspaces (`apps/api`, `apps/web`, `packages/shared`).
- **Bug Fixes Only:** Only critical fixes that affect parity validation against the Node.js implementation will be considered until parity is achieved in Milestone 4.

## 2. Running the Legacy Application
Ensure you have Python 3.10+ installed and the required virtual environment active:

```bash
# Activate virtual environment (if applicable)
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Run the reference Streamlit application
streamlit run app.py