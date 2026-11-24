# News ingest job: fetches RSS feeds and writes news_items (idempotent).
# Built from the repo root: `docker build -f apps/python/Dockerfile -t <uri>:latest .`
# Push to the OUT-OF-STACK repo `chaintelescope/news-job` (see infra/README.md).
FROM python:3.11-slim

WORKDIR /app

COPY apps/python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/python ./

# Non-root like the API runtime; files are world-readable from COPY.
RUN useradd --uid 10001 --create-home job
USER job

CMD ["python", "-m", "src.data.news.writer"]
