import streamlit as st

from src.components.assistant import render_assistant_panel
from src.components.dashboard_header import render_dashboard_header
from src.components.feed_panels import render_alerts_panel, render_news_panel
from src.components.kpi_row import render_kpi_row
from src.components.price_trend import render_price_trend
from src.components.risk_graph import render_risk_graph
from src.components.trending_report import render_trending_report
from src.views import cached_dashboard_snapshot


def render_dashboard_page(
    time_window: str, watchlist: list[str], market_source: str, trend_filter: str
):
    snapshot = cached_dashboard_snapshot(time_window, watchlist, market_source, trend_filter)
    render_dashboard_header(time_window, watchlist, market_source, trend_filter)
    render_kpi_row(snapshot)

    st.markdown("### Market overview")
    chart_col, risk_col = st.columns([2.1, 1], gap="large")
    with chart_col:
        render_price_trend(snapshot)
    with risk_col:
        render_risk_graph(snapshot)

    st.markdown("### Watchlist and signals")
    table_col, signal_col = st.columns([1.45, 1], gap="large")
    with table_col:
        render_trending_report(snapshot)
    with signal_col:
        render_alerts_panel(snapshot)
        render_news_panel(snapshot)

    st.markdown("### AI assistant")
    render_assistant_panel(time_window, watchlist, market_source, trend_filter)
