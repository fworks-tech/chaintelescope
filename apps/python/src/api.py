import os

from fastapi import Body, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from src.data.dashboard_query import DashboardSnapshot, load_dashboard_snapshot

app = FastAPI(title="ChainTelescope API", version="0.1.0")

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8501").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_handler(request, exc):
    logger.warning("API error on {}: {}", request.url.path, exc)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


def _snapshot_to_dict(snap: DashboardSnapshot) -> dict:
    return {
        "time_window": snap.time_window,
        "watchlist": snap.watchlist,
        "trend_filter": snap.trend_filter,
        "primary_asset": snap.primary_asset,
        "price_dates": [d.isoformat() for d in snap.price_dates],
        "price_values": snap.price_values,
        "price_source": snap.price_source,
        "kpis": snap.kpis,
        "risk_scores": snap.risk_scores,
        "risk_labels": snap.risk_labels,
        "risk_colors": snap.risk_colors,
        "alerts": snap.alerts,
        "news": snap.news,
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/snapshot")
def snapshot(
    window: str = Query("30D", description="Time window"),
    assets: str = Query("BTC", description="Comma-separated watchlist"),
    source: str = Query("auto", description="Market source"),
    trend: str = Query("all", description="Trend filter"),
):
    watchlist = [a.strip() for a in assets.split(",") if a.strip()]
    snap = load_dashboard_snapshot(
        time_window=window,
        watchlist=watchlist or None,
        market_source=source,
        trend_filter=trend,
    )
    return _snapshot_to_dict(snap)


@app.get("/api/price-trend")
def price_trend(
    asset: str = Query("BTC"),
    days: int = Query(30),
    window: str = Query("30D"),
    source: str = Query("auto"),
):
    from src.data.market.service import fetch_price_trend

    dates, prices, trend, used_source = fetch_price_trend(asset, days, window, market_source=source)
    return {
        "asset": asset,
        "dates": [d.isoformat() for d in dates],
        "prices": prices,
        "trend": trend.tolist() if hasattr(trend, "tolist") else list(trend),
        "source": used_source,
    }


@app.get("/api/news")
def news(
    watchlist: str = Query("BTC", description="Comma-separated watchlist"),
    limit: int = Query(10, description="Max items to return"),
):
    from src.data.news.ingestion import load_news_items

    items = load_news_items(watchlist=[a.strip() for a in watchlist.split(",") if a.strip()])
    items = items[: max(limit, 1)]
    return [
        {
            "id": item.id,
            "source": item.source,
            "published_at": item.published_at.isoformat(),
            "title": item.title,
            "url": item.url,
            "tags": item.tags,
        }
        for item in items
    ]


@app.get("/api/alerts")
def alerts(
    window: str = Query("30D"),
    assets: str = Query("BTC", description="Comma-separated watchlist"),
):
    from src.data.dashboard_query import load_dashboard_snapshot

    watchlist = [a.strip() for a in assets.split(",") if a.strip()]
    snap = load_dashboard_snapshot(time_window=window, watchlist=watchlist or None)
    return {"alerts": snap.alerts}


@app.post("/api/newsletter/subscribe")
def subscribe(
    email: str = Body(..., description="Email address"),
    frequency: str = Body("Weekly", description="Daily/Weekly/Biweekly"),
    format: str = Body("Summary", description="Summary/Deep Dive"),
):
    from src.data.newsletter.store import save_subscription

    result = save_subscription(email, frequency, format)
    if result is None:
        return {"success": False, "error": "Failed to save subscription"}
    return {"success": True, "email": result.email}


@app.get("/api/newsletter/subscriptions")
def subscriptions():
    from src.data.newsletter.store import list_subscriptions

    return [
        {
            "email": sub.email,
            "frequency": sub.frequency,
            "format": sub.format,
            "created_at": sub.created_at,
        }
        for sub in list_subscriptions()
    ]
