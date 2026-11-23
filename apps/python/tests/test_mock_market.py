import unittest

from src.data.assets import WATCHLIST_OPTIONS
from src.data.mock_market import (
    alert_snapshot_lines,
    alerts_snapshot,
    kpi_snapshot,
    kpi_snapshot_lines,
    news_snapshot,
    news_snapshot_lines,
    price_trend_series,
    risk_graph_colors,
    risk_graph_labels,
    risk_graph_scores,
    trending_report_frame,
)


class MockMarketTests(unittest.TestCase):
    def test_price_trend_series_lengths(self):
        days = 30
        dates, prices, trend = price_trend_series(days=days)
        self.assertEqual(len(dates), days)
        self.assertEqual(len(prices), days)
        self.assertEqual(len(trend), days)

    def test_trending_report_frame_has_expected_assets(self):
        frame = trending_report_frame()
        self.assertEqual(len(frame), len(WATCHLIST_OPTIONS))
        self.assertEqual(list(frame["Asset"]), list(WATCHLIST_OPTIONS))

    def test_trending_report_frame_top_gainers(self):
        frame = trending_report_frame(["BTC", "ETH", "SOL", "XRP"], "top_gainers")
        self.assertEqual(list(frame["Asset"]), ["SOL", "BTC", "ETH"])

    def test_trending_report_frame_hot(self):
        frame = trending_report_frame(["BTC", "ETH", "SOL", "XRP"], "hot")
        self.assertEqual(list(frame["Asset"]), ["SOL"])

    def test_risk_graph_inputs_align(self):
        scores = risk_graph_scores()
        labels = risk_graph_labels()
        colors = risk_graph_colors()
        self.assertEqual(len(scores), len(labels))
        self.assertEqual(len(scores), len(colors))

    def test_snapshot_line_helpers_match_snapshots(self):
        self.assertEqual(
            kpi_snapshot_lines(),
            [f"{item['label']}: {item['value']} ({item['delta']})" for item in kpi_snapshot()],
        )
        self.assertEqual(alert_snapshot_lines(), list(alerts_snapshot()))
        self.assertEqual(news_snapshot_lines(), list(news_snapshot()))


if __name__ == "__main__":
    unittest.main()
