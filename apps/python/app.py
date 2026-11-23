from datetime import UTC, datetime

import streamlit as st
from src.logging import setup_logging
from src.styles import inject_global_styles

setup_logging()

st.set_page_config(page_title="ChainTelescope", page_icon="📈", layout="wide")
inject_global_styles()

with st.sidebar:
    st.markdown("## ChainTelescope")
    st.caption("Crypto Command Center")

nav = st.navigation(
    [
        st.Page("pages/dashboard.py", title="Dashboard", icon="📊"),
        st.Page("pages/alerts.py", title="Alerts", icon="🔔"),
        st.Page("pages/news.py", title="News", icon="📰"),
        st.Page("pages/risk.py", title="Risk", icon="⚠️"),
        st.Page("pages/newsletter.py", title="Newsletter", icon="📧"),
    ]
)


def _greeting_for_hour(hour: int) -> str:
    if 5 <= hour < 12:
        return "Good Morning"
    if 12 <= hour < 18:
        return "Good Afternoon"
    return "Good Evening"


display_name = st.session_state.get("display_name")
now_utc = datetime.now(UTC)
greeting = _greeting_for_hour(now_utc.hour)
st.markdown(f"## {greeting}{f', {display_name}' if display_name else ''}")
st.caption(f"Live snapshot • {now_utc:%Y-%m-%d %H:%M} UTC")

nav.run()
