import streamlit as st


@st.cache_data(ttl=30)
def cached_dashboard_snapshot(*args, **kwargs):
    from src.data.dashboard_query import load_dashboard_snapshot

    return load_dashboard_snapshot(*args, **kwargs)
