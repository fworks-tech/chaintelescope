# Development Guide

Guide for developers contributing to ChainTelescope. Covers local setup, coding conventions, testing, and workflow.

## Prerequisites

- Python 3.11
- Git
- VS Code (recommended) with Python extension
- Optional: Docker for containerized development

## Setup

```powershell
git clone https://github.com/fworks-tech/chain-telescope.git
cd chain-telescope

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r apps/python/requirements.txt
pip install ruff
```

Then install `pre-commit` hooks (when configured):
```powershell
pip install pre-commit
pre-commit install
```

## Running the app

```powershell
streamlit run apps/python/app.py
```

Opens at `http://localhost:8501`.

## Code quality gates

Run these commands before committing, from `apps/python/` in this order:

```powershell
# 1. Lint
python -m ruff check app.py src pages tests

# 2. Format check
python -m ruff format --check app.py src pages tests

# Auto-fix if needed
python -m ruff check --fix app.py src pages tests
python -m ruff format app.py src pages tests

# 3. Compile check (still inside `apps/python/`)
python -m py_compile app.py
Get-ChildItem -Path src, pages -Recurse -Filter *.py | ForEach-Object {
    python -m py_compile $_.FullName
}

# 4. Tests
python -m unittest discover -s tests -p 'test_*.py' -v
```

## Project structure

```
chain-telescope/
├── apps/
│   └── python/             # Streamlit + FastAPI + ML/data layer (Vercel)
│       ├── app.py          # Streamlit entrypoint (st.navigation)
│       ├── pages/          # Page stubs → src/views/
│       ├── src/
│       │   ├── app_shell.py        # Sidebar filter engine
│       │   ├── styles.py           # Global CSS injection
│       │   ├── logging.py          # Loguru sink configuration
│       │   ├── components/         # UI components (10 modules)
│       │   ├── views/              # View renderers composing components
│       │   │   └── __init__.py     # Cached snapshot wrapper
│       │   ├── data/               # Data layer
│       │   │   ├── dashboard_query.py
│       │   │   ├── assets.py       # 100 asset symbol mappings
│       │   │   ├── market/         # Exchange adapters (binance, coingecko, coinbase)
│       │   │   ├── news/           # RSS ingestion
│       │   │   ├── alerts/         # Alert rules engine
│       │   │   └── newsletter/     # Subscription persistence
│       │   └── validation/
│       │       └── email.py        # Email validation
│       ├── notebooks/      # Jupyter notebooks (EDA, strategies, reports)
│       ├── tests/          # Unittest files
│       ├── requirements.txt
│       └── pyproject.toml  # [tool.vercel] entrypoint = "src.api:app"
├── apps/api/               # Hapi.js API (ECS Fargate + RDS)
├── apps/web/               # React + Vite SPA (Vercel)
├── docs/                   # Documentation
│   ├── Architecture.md
│   ├── configuration.md
│   ├── deployment.md
│   ├── operations.md
│   ├── development.md
│   ├── source-inventory-m4.md
│   └── adr/                # Architecture Decision Records
└── scripts/
    └── pr-skill.py         # PR automation tool
```

## Coding conventions

### Python

- Python 3.11+, type hints on all public functions
- Ruff lint rules: `E,F,I,UP,B` (ignore `E501`)
- Line length: 100 characters
- Double quotes for strings
- Space indentation

### Imports

Order: standard library → third-party → local modules. One blank line between groups.

```python
import json
from datetime import UTC, datetime

import pandas as pd
import streamlit as st
from loguru import logger

from src.data.market.service import fetch_price_trend
```

### Naming

- `snake_case` for functions, variables, modules
- `PascalCase` for classes, dataclasses, type aliases
- `UPPER_CASE` for constants
- Prefix boolean variables with `is_`, `has_`, `should_`

### Testing

- Use **unittest** only (no pytest)
- One test file per concern (e.g., `test_market_service.py`)
- Test names describe behavior: `test_fetch_price_trend_falls_back_to_mock`
- Mock external APIs, test fallback paths
- New features require new tests

## Architecture patterns

### Adding a new page

1. Create `apps/python/src/views/new_page_view.py` with `render_new_page()` function
2. Create `apps/python/pages/new_page.py` — thin stub importing the view
3. Add route to `apps/python/app.py` `st.navigation()` call
4. Add component if needed in `apps/python/src/components/`

### Adding a new market provider

1. Create `src/data/market/new_provider.py` with `fetch_new_provider_series()` function
2. Add symbol mappings to `src/data/assets.py`
3. Update `_fetch_provider_series()` in `src/data/market/service.py`
4. Update `_provider_chain()` in `service.py` for fallback order
5. Add config env vars to `src/data/market/config.py`
6. Document in `docs/configuration.md`

### Adding a new alert rule

1. Add `AlertRule` instance to `DEFAULT_RULES` in `src/data/alerts/rules.py`
2. Implement evaluation logic in `evaluate_alert_rules()`
3. Add test in `tests/test_m4_modules.py` or a new test file

## Notebook development

Jupyter notebooks import from `src/`. Run from the repo root:

```python
# In notebook setup cell:
import sys
sys.path.insert(0, str(Path.cwd()))
from src.data.dashboard_query import load_dashboard_snapshot
```

See `notebooks/eda/01-market-exploration.ipynb` for a starter template.

## PR workflow

```powershell
# Create branch from main
git checkout main
git pull origin main
git checkout -b feat/my-feature

# Make changes, run quality gates
python -m ruff check app.py src tests
python -m unittest discover -s tests -p 'test_*.py' -v

# Commit with conventional commit message
git add -A
git commit -m "feat(scope): short description"

# Push and create PR
git push origin feat/my-feature
# Then create PR on GitHub, or use:
python scripts/pr-skill.py create
```

### Conventional commit types

| Type | When to use |
|------|------------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `chore` | Maintenance, deps, config |
| `refactor` | Code restructure without behavior change |
| `test` | Adding or fixing tests |
| `ci` | CI/CD changes |

## Related

- [Architecture.md](Architecture.md) — system structure
- [AGENTS.md](../AGENTS.md) — AI agent quick reference
- [Deployment.md](deployment.md) — production deployment
