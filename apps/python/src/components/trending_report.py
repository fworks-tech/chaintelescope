import streamlit as st

from src.data.dashboard_query import DashboardSnapshot

TREND_CAPTIONS = {
    "all": "Watchlist assets ranked by sentiment and risk for the selected window.",
    "top_gainers": "Positive movers from the current watchlist, sorted by 7D change.",
    "top_losers": "Negative movers from the current watchlist, sorted by 7D change.",
    "hot": "High-momentum assets with very bullish sentiment or elevated 7D change.",
}


def render_trending_report(snapshot: DashboardSnapshot):
    with st.container(border=True):
        st.subheader("Trending report")
        st.caption(TREND_CAPTIONS.get(snapshot.trend_filter, TREND_CAPTIONS["all"]))
        st.dataframe(snapshot.trending, hide_index=True, width="stretch")
