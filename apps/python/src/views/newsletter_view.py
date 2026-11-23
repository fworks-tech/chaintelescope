import streamlit as st

from src.components.newsletter import render_newsletter


def render_newsletter_page():
    st.markdown("## Newsletter")
    st.caption(
        "Persist subscriptions locally and queue stub delivery until a provider is configured."
    )
    render_newsletter()
