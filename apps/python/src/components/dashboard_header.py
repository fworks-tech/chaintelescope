from datetime import UTC, datetime

import streamlit as st


def render_dashboard_header(
    time_window: str, watchlist: list[str], market_source: str, trend_filter: str
):
    watchlist_label = ", ".join(watchlist) if watchlist else "No assets selected"
    trend_label = trend_filter.replace("_", " ")
    st.markdown("## Market dashboard")
    st.caption(
        f"Tracking {watchlist_label} over {time_window} from {market_source} "
        f"with {trend_label} trend filter. "
        f"Updated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC."
    )
