import plotly.graph_objects as go
import streamlit as st

from src.components.chart_theme import chart_layout
from src.data.dashboard_query import DashboardSnapshot


def render_price_trend(snapshot: DashboardSnapshot):
    with st.container(border=True):
        st.subheader("Price trend")
        if not snapshot.price_dates or not snapshot.price_values:
            st.caption("Price data unavailable for the current selection.")
            return
        st.caption(f"Primary asset: {snapshot.primary_asset} • Source: {snapshot.price_source}")
        fig = go.Figure()
        fig.add_trace(
            go.Scatter(
                x=snapshot.price_dates,
                y=snapshot.price_values,
                name=snapshot.primary_asset,
                mode="lines",
                line=dict(color="#3b5bff", width=2.4),
            )
        )
        if snapshot.price_trend is not None and len(snapshot.price_trend) == len(
            snapshot.price_values
        ):
            fig.add_trace(
                go.Scatter(
                    x=snapshot.price_dates,
                    y=snapshot.price_trend,
                    name="Trend",
                    mode="lines",
                    line=dict(color="#94a3ff", width=2, dash="dot"),
                )
            )
        fig.update_layout(**chart_layout(320))
        st.plotly_chart(fig, width="stretch")
