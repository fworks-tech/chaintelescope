# Deployment

> **Status:** runbook guidance, not a shipped artifact. This repository has no root `Dockerfile` and no `docker-compose.yml`; the `apps/api/Dockerfile` is a distroless image for the Node API and is not part of these steps. Deploy the Streamlit app with your own container image, or use Streamlit Community Cloud (the live URL).

ChainTelescope is a Streamlit app designed to run behind a reverse proxy on a VPS or container environment. This guide covers Docker deployment, environment configuration, domain setup, and CI/CD.

## Quick start (Docker)

```bash
# Build and start all services
git clone https://github.com/fworks-tech/chain-telescope.git
cd chain-telescope
docker compose up --build -d
```

The app is served at `http://localhost:8501`.

## Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in the values:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `OPENAI_API_KEY` | For AI assistant | — | OpenAI-compatible API key |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Provider base URL |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Model name |
| `OPENAI_TIMEOUT_SECONDS` | No | `15` | HTTP timeout in seconds |
| `MARKET_PROVIDER` | No | `auto` | `auto`, `binance`, `coingecko`, `coinbase`, or `mock` |
| `MARKET_REQUEST_TIMEOUT_SECONDS` | No | `10` | HTTP timeout for market calls (legacy; ccxt manages its own timeouts) |
| `NEWS_FEED_URLS` | No | CoinDesk + Cointelegraph RSS | Comma-separated RSS/Atom URLs |
| `NEWSLETTER_PROVIDER` | No | `stub` | Delivery adapter name |
| `NEWSLETTER_API_KEY` | For non-stub | — | Provider credential |
| `SENTRY_DSN` | For error tracking | — | Sentry project DSN |

See [configuration.md](configuration.md) for details.

## Docker setup

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A domain with DNS pointing to your server
- (Optional) Cloudflare or similar for SSL/TLS

### docker-compose.yml

```yaml
services:
  streamlit:
    build: .
    ports:
      - "8501:8501"
    env_file: .env
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8501"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Building

```bash
docker compose build --no-cache
docker compose up -d
docker compose logs -f
```

### Updating

```bash
git pull origin main
docker compose build --no-cache
docker compose up -d
```

## Domain setup with reverse proxy

### Nginx (recommended)

```nginx
server {
    listen 80;
    server_name chain-telescope.example.com;

    location / {
        proxy_pass http://127.0.0.1:8501;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

### SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d chain-telescope.example.com
```

### Caddy (simpler alternative)

```caddyfile
chain-telescope.example.com {
    reverse_proxy 127.0.0.1:8501
}
```

Caddy auto-provisions SSL — no Certbot needed.

## Streamlit Cloud (alternative)

You can also deploy directly on [Streamlit Community Cloud](https://streamlit.io/cloud):

1. Push to GitHub
2. Log in to share.streamlit.io
3. Deploy from `fworks-tech/chain-telescope`, branch `main`, entrypoint `app.py`
4. Set secrets via the Streamlit Cloud dashboard UI

Limitations: no background workers, no custom domain on free tier, ephemeral storage.

## CI/CD

GitHub Actions runs on push to `main` and on PRs:

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r requirements.txt
      - run: python -m unittest discover -s tests -p 'test_*.py' -v
```

For production deploys, add a deploy job that rebuilds and restarts the Docker service on your VPS via SSH or a webhook.

## Architecture diagram

```
                         ┌─────────────┐
                         │  Cloudflare  │
                         │  (SSL/TLS)   │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │    Nginx     │
                         │  (reverse    │
                         │   proxy)     │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │   Streamlit  │
                         │   (:8501)    │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │    data/     │
                         │ (persistent) │
                         └─────────────┘
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| App doesn't start | Port 8501 in use | `netstat -tulpn \| grep 8501`; kill conflicting process |
| AI assistant returns fallback | No `OPENAI_API_KEY` | Set the env var and restart |
| News shows mock headlines | Feeds unreachable | Check `NEWS_FEED_URLS` and network connectivity |
| Price chart shows mock data | All exchange APIs down | Check provider status; market will auto-fallback to mock |
| Docker build fails | Python dependency mismatch | `docker compose build --no-cache` to refresh layers |

## Related

- [Architecture.md](Architecture.md) — system structure
- [Configuration.md](configuration.md) — full env var reference
- [Operations.md](operations.md) — production runbook
- [Development.md](development.md) — developer guide
