import streamlit as st

from src.views import cached_dashboard_snapshot


def render_news_page(time_window: str, watchlist: list[str], market_source: str, trend_filter: str):
    snapshot = cached_dashboard_snapshot(time_window, watchlist, market_source, trend_filter)
    st.markdown("## News")
    st.caption("Normalized feed items with safe fallback when remote feeds are unavailable.")
    if not snapshot.news_items:
        st.info("No news items available.")
        return
    st.dataframe(
        {
            "Source": [item.source for item in snapshot.news_items],
            "Published": [item.published_at.isoformat() for item in snapshot.news_items],
            "Title": [item.title for item in snapshot.news_items],
            "URL": [item.url for item in snapshot.news_items],
        },
        hide_index=True,
        width="stretch",
    )
