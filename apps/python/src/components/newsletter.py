import streamlit as st

from src.data.newsletter.delivery import deliver_subscription
from src.data.newsletter.store import save_subscription
from src.validation.email import is_valid_email


def render_newsletter():
    st.markdown('<div class="panel">', unsafe_allow_html=True)
    st.subheader("Newsletter")
    a, b, c = st.columns([2, 1, 1])
    email = a.text_input("Email", placeholder="you@domain.com")
    freq = b.selectbox("Frequency", ["Daily", "Weekly", "Biweekly"], index=1)
    fmt = c.selectbox("Format", ["Summary", "Deep Dive"], index=0)
    if st.button("Subscribe"):
        if is_valid_email(email):
            subscription = save_subscription(email, freq, fmt)
            delivery_message = deliver_subscription(subscription)
            st.success(
                f"Subscribed: {subscription.email} • {subscription.frequency} • {subscription.format}"
            )
            st.caption(delivery_message)
        else:
            st.error("Please enter a valid email.")
    st.markdown("</div>", unsafe_allow_html=True)
