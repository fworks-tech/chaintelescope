from dataclasses import dataclass

import pandas as pd

from src.data.alerts.rules import evaluate_alert_rules
from src.data.market.service import fetch_price_trend
from src.data.mock_market import (
    TIME_WINDOW_DAYS,
    kpi_snapshot,
    risk_graph_colors,
    risk_graph_labels,
    risk_snapshot,
    trending_report_frame,
)
from src.data.news.ingestion import load_news_items


@dataclass
class DashboardSnapshot:
    time_window: str
    watchlist: list[str]
    trend_filter: str
    primary_asset: str
    price_dates: list
    price_values: list
    price_trend: pd.Series
    price_source: str
    trending: pd.DataFrame
    kpis: list[dict]
    risk_scores: list[int]
    risk_labels: list[str]
    risk_colors: list[str]
    alerts: list[str]
    news: list[str]
    news_items: list


def load_dashboard_snapshot(
    time_window: str,
    watchlist: list[str] | None = None,
    market_source: str = "auto",
    trend_filter: str = "all",
) -> DashboardSnapshot:
    selected = watchlist or ["BTC"]
    primary_asset = selected[0]
    days = TIME_WINDOW_DAYS.get(time_window, 30)
    dates, prices, trend, source = fetch_price_trend(
        primary_asset, days, time_window, market_source=market_source
    )

    trending = trending_report_frame(selected, trend_filter)
    news_items = load_news_items(selected)
    news_lines = [item.title for item in news_items[:3]] or [
        "No news items available for the current watchlist."
    ]

    return DashboardSnapshot(
        time_window=time_window,
        watchlist=selected,
        trend_filter=trend_filter,
        primary_asset=primary_asset,
        price_dates=dates,
        price_values=prices,
        price_trend=trend,
        price_source=source,
        trending=trending,
        kpis=kpi_snapshot(time_window, selected),
        risk_scores=risk_snapshot(time_window),
        risk_labels=risk_graph_labels(),
        risk_colors=risk_graph_colors(),
        alerts=evaluate_alert_rules(time_window, selected, prices),
        news=news_lines,
        news_items=news_items,
    )
