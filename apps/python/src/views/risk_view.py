import streamlit as st

from src.components.risk_graph import render_risk_graph
from src.views import cached_dashboard_snapshot


def render_risk_page(time_window: str, watchlist: list[str], market_source: str, trend_filter: str):
    snapshot = cached_dashboard_snapshot(time_window, watchlist, market_source, trend_filter)
    st.markdown("## Risk")
    st.caption(f"Risk profile for {snapshot.time_window} across the selected watchlist.")
    render_risk_graph(snapshot)
