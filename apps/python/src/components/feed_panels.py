from html import escape

import streamlit as st

from src.data.dashboard_query import DashboardSnapshot


def _render_feed_items(items: list[str] | None, empty_message: str):
    if items:
        for line in items:
            st.markdown(f'<p class="feed-item">{escape(line)}</p>', unsafe_allow_html=True)
    else:
        st.caption(empty_message)


def render_alerts_panel(snapshot: DashboardSnapshot):
    with st.container(border=True):
        st.subheader("Alerts")
        items = snapshot.alerts if snapshot is not None else None
        _render_feed_items(items, "No active alerts for this watchlist window.")


def render_news_panel(snapshot: DashboardSnapshot):
    with st.container(border=True):
        st.subheader("News snapshot")
        items = snapshot.news if snapshot is not None else None
        _render_feed_items(items, "No news items matched the current watchlist.")
