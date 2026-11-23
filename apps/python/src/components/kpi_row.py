import streamlit as st

from src.data.dashboard_query import DashboardSnapshot

_KPI_KEYS = frozenset({"label", "value", "delta", "color"})


def render_kpi_row(snapshot: DashboardSnapshot):
    if not snapshot.kpis:
        st.caption("KPI data unavailable")
        return
    kpis = snapshot.kpis[:4]
    columns = st.columns(len(kpis), gap="medium")
    for column, card in zip(columns, kpis, strict=False):
        if not isinstance(card, dict) or not _KPI_KEYS.issubset(card):
            column.caption("—")
            continue
        with column.container(border=True):
            st.caption(card.get("label", ""))
            st.markdown(f'<div class="kpi-value">{card["value"]}</div>', unsafe_allow_html=True)
            st.markdown(
                f'<div class="kpi-delta" style="color:{card["color"]}">{card["delta"]}</div>',
                unsafe_allow_html=True,
            )
