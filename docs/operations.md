# Operations Runbook

> **Status:** runbook guidance, not a shipped artifact. Health-check and backup commands assume a deployment you operate; the repository ships neither a compose file nor a deployed service definition.

Production runbook for ChainTelescope. Covers health checks, monitoring, backups, incident response, and common maintenance tasks.

## Health checks

### Application health

The Streamlit app exposes no dedicated health endpoint. Verify health by:

```bash
# Check process is running
docker ps | grep chain-telescope-streamlit

# Check HTTP response (Streamlit returns 200 on its main page)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8501

# Check logs for errors
docker logs chain-telescope-streamlit --tail 50 | grep -i "error\|traceback\|exception"
```

### Data provider health

```bash
# Check mock vs live data source
# Open the dashboard and verify the price chart caption shows the expected source

# Verify news feeds are resolving
curl -s -o /dev/null -w "%{http_code}" https://www.coindesk.com/arc/outboundfeeds/rss/
curl -s -o /dev/null -w "%{http_code}" https://cointelegraph.com/rss
```

### Services checklist

| Service | Check | Frequency |
|---------|-------|-----------|
| Streamlit UI | HTTP 200 on :8501 | Every 30s (Docker healthcheck) |
| News feeds | RSS resolves | Daily |
| Market APIs | Price chart shows real data | Daily |
| Newsletter storage | `data/newsletter_subscriptions.json` writable | Weekly |
| Disk space | `df -h` < 80% | Weekly |

## Monitoring

### Logs

Application logs go to stderr via loguru. View with:

```bash
# Tail live logs
docker logs -f chain-telescope-streamlit

# Filter warnings (provider failures, feed issues)
docker logs chain-telescope-streamlit 2>&1 | grep "WARNING"

# Search for errors in the last hour
docker logs --since 1h chain-telescope-streamlit 2>&1 | grep -i "error\|traceback"
```

Log format:
```
2026-07-01 10:15:23 |  WARNING | src.data.market.service:fetch_price_trend:25 - Provider binance failed for BTC: ...
```

### Uptime monitoring

For production, add a free uptime monitor:

- [UptimeRobot](https://uptimerobot.com/) — free tier checks every 5 minutes
- [Better Uptime](https://betteruptime.com/) — free tier with status page
- Point to `https://chain-telescope.example.com`

### Error tracking

If `SENTRY_DSN` is configured, errors in the Streamlit app and background workers are automatically reported to Sentry.

## Backups

### What to back up

| Path | Contents | Backup strategy |
|------|----------|----------------|
| `data/newsletter_subscriptions.json` | User subscriptions | Daily via cron |
| `.streamlit/secrets.toml` | Secrets (if using file-based) | Manual, encrypted |
| `.env` | Environment variables | Manual, encrypted |

### Automated backup

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR=/var/backups/chain-telescope
mkdir -p $BACKUP_DIR
cp /opt/chain-telescope/data/newsletter_subscriptions.json $BACKUP_DIR/subscriptions-$(date +%Y%m%d).json
find $BACKUP_DIR -name "subscriptions-*.json" -mtime +30 -delete
```

Add to crontab:
```cron
0 3 * * * /opt/chain-telescope/scripts/backup.sh
```

## Incident response

### Severity levels

| Severity | Definition | Response time |
|----------|------------|--------------|
| P0 | App down, all users affected | Immediate |
| P1 | Major feature broken | 1 hour |
| P2 | Minor feature broken | 24 hours |
| P3 | Cosmetic or non-urgent | Next release |

### Runbook: P0 — App is down

1. Check server: `ping chain-telescope.example.com`
2. Check Docker: `docker ps` — is the container running?
3. Check logs: `docker logs chain-telescope-streamlit --tail 100`
4. Check resources: `df -h`, `free -m`, `top`
5. Restart: `docker compose restart streamlit`
6. If no recovery: `docker compose down && docker compose up -d --build`
7. If server is unreachable: SSH into host via VPS dashboard and reboot

### Runbook: P1 — Provider failures

Symptom: Price chart shows mock data, news shows fallback headlines

1. Check exchange API status:
   ```bash
   curl -s https://api.binance.com/api/v3/ping
   curl -s https://api.coingecko.com/api/v3/ping
   ```
2. Check news feeds:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://www.coindesk.com/arc/outboundfeeds/rss/
   ```
3. Check logs for provider errors:
   ```bash
   docker logs chain-telescope-streamlit --since 30m 2>&1 | grep "WARNING.*Provider\|WARNING.*Feed"
   ```
4. If rate-limited, wait 5 minutes — tenacity retry will self-resolve

### Runbook: P2 — Newsletters not sending

1. Verify provider config:
   ```bash
   docker exec chain-telescope-streamlit env | grep NEWSLETTER
   ```
2. Check subscription storage:
   ```bash
   cat data/newsletter_subscriptions.json
   ```
3. Trigger dry run:
   ```bash
   # Manual dispatch via the Newsletter page in the dashboard
   ```

## Maintenance

### Updating

```bash
cd /opt/chain-telescope
git pull origin main
docker compose build --no-cache
docker compose up -d
```

### Data migration

If the `DashboardSnapshot` model changes (new fields), the cached snapshot from `@st.cache_data` will invalidate automatically within 30 seconds. No manual migration needed for cache.

For newsletter subscriptions, data is stored as JSON — format changes require a migration script.

### SSL renewal

```bash
# Certbot
sudo certbot renew

# Caddy (automatic)
# No action needed — Caddy renews automatically
```

## Common commands

```bash
# View live logs
docker logs -f chain-telescope-streamlit

# Restart without rebuilding
docker compose restart streamlit

# Full rebuild and restart
docker compose down && docker compose up -d --build

# Enter the container
docker exec -it chain-telescope-streamlit bash

# Check resource usage
docker stats chain-telescope-streamlit

# Run tests inside container
docker exec chain-telescope-streamlit python -m unittest discover -s tests
```

## Related

- [Deployment.md](deployment.md) — setup and deploy instructions
- [Architecture.md](Architecture.md) — system structure
- [configuration.md](configuration.md) — environment variables
