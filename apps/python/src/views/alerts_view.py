import streamlit as st

from src.data.alerts.rules import DEFAULT_RULES
from src.views import cached_dashboard_snapshot


def render_alerts_page(
    time_window: str, watchlist: list[str], market_source: str, trend_filter: str
):
    snapshot = cached_dashboard_snapshot(time_window, watchlist, market_source, trend_filter)
    st.markdown("## Alerts")
    st.caption("Rule-driven alerts for the selected watchlist and time window.")
    st.markdown("### Active alerts")
    for alert in snapshot.alerts:
        st.markdown(f"- {alert}")
    st.markdown("### Configured rules")
    for rule in DEFAULT_RULES:
        st.markdown(
            f"- `{rule.id}`: {rule.description} (threshold {rule.threshold:.0%}, {rule.confidence} confidence)"
        )
    st.caption("Rules evaluate the primary watchlist asset over the selected window.")
