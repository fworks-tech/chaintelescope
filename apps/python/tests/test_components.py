import unittest
from unittest.mock import patch

import pandas as pd
from src.components.feed_panels import render_alerts_panel, render_news_panel
from src.components.kpi_row import render_kpi_row
from src.components.price_trend import render_price_trend
from src.components.risk_graph import render_risk_graph
from src.data.dashboard_query import DashboardSnapshot


def _empty_snapshot(**overrides) -> DashboardSnapshot:
    defaults = dict(
        time_window="30D",
        watchlist=["BTC"],
        trend_filter="all",
        primary_asset="BTC",
        price_dates=[],
        price_values=[],
        price_trend=pd.Series(dtype=float),
        price_source="mock",
        trending=pd.DataFrame(),
        kpis=[],
        risk_scores=[],
        risk_labels=[],
        risk_colors=[],
        alerts=[],
        news=[],
        news_items=[],
    )
    defaults.update(overrides)
    return DashboardSnapshot(**defaults)


class ComponentGuardTests(unittest.TestCase):
    @patch("streamlit.caption")
    @patch("streamlit.container")
    def test_price_trend_handles_empty_data(self, _mock_container, mock_caption):
        snap = _empty_snapshot()
        render_price_trend(snap)
        mock_caption.assert_any_call("Price data unavailable for the current selection.")

    @patch("streamlit.caption")
    @patch("streamlit.container")
    def test_risk_graph_handles_empty_data(self, _mock_container, mock_caption):
        snap = _empty_snapshot()
        render_risk_graph(snap)
        mock_caption.assert_any_call("Risk data unavailable for the current selection.")

    @patch("streamlit.caption")
    @patch("streamlit.container")
    def test_kpi_row_handles_empty_kpis(self, _mock_container, mock_caption):
        snap = _empty_snapshot()
        render_kpi_row(snap)
        mock_caption.assert_any_call("KPI data unavailable")

    @patch("streamlit.caption")
    @patch("streamlit.subheader")
    @patch("streamlit.container")
    def test_alerts_panel_handles_none_snapshot(self, _mock_container, _mock_sub, mock_caption):
        render_alerts_panel(None)  # type: ignore
        mock_caption.assert_any_call("No active alerts for this watchlist window.")

    @patch("streamlit.caption")
    @patch("streamlit.subheader")
    @patch("streamlit.container")
    def test_news_panel_handles_none_snapshot(self, _mock_container, _mock_sub, mock_caption):
        render_news_panel(None)  # type: ignore
        mock_caption.assert_any_call("No news items matched the current watchlist.")


if __name__ == "__main__":
    unittest.main()
