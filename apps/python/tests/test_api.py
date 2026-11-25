import unittest
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from src.api import app
from src.data.dashboard_query import DashboardSnapshot
from src.data.market import service as market_service
from src.data.news.models import FeedItem

client = TestClient(app)


class ApiHealthTests(unittest.TestCase):
    def test_health_returns_ok(self):
        resp = client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "ok"})


class ApiSnapshotTests(unittest.TestCase):
    def setUp(self):
        market_service._CACHE.clear()

    @patch("src.data.market.service.fetch_ccxt_series", return_value=None)
    @patch("src.data.news.ingestion._parse_feed", return_value=[])
    def test_snapshot_returns_expected_structure(self, _mock_news, _mock_ccxt):
        resp = client.get("/api/snapshot?window=30D&assets=BTC&source=mock")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("primaryAsset", data)
        self.assertIn("priceValues", data)
        self.assertIn("kpis", data)
        self.assertIn("alerts", data)

    def test_snapshot_with_multiple_assets(self):
        resp = client.get("/api/snapshot?window=30D&assets=BTC,ETH,SOL")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("BTC", data["watchlist"])

    @patch("src.api.load_dashboard_snapshot")
    def test_snapshot_uses_shared_camel_case_contract(self, mock_load):
        mock_load.return_value = DashboardSnapshot(
            time_window="30D",
            watchlist=["BTC", "ETH"],
            trend_filter="all",
            primary_asset="BTC",
            price_dates=[datetime(2026, 1, 1, tzinfo=UTC)],
            price_values=[100.0],
            price_trend=[],
            price_source="mock",
            trending=None,
            kpis=[
                {
                    "label": "Market Cap Tracked",
                    "value": "$1.91T",
                    "delta": "+2.8%",
                    "color": "#12b76a",
                }
            ],
            risk_scores=[62],
            risk_labels=["Market"],
            risk_colors=["#f79009"],
            alerts=["BTC below 63,500"],
            news=["SEC proposal"],
            news_items=[],
        )

        resp = client.get("/api/snapshot?window=30D&assets=BTC,ETH&source=mock")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {
                "timeWindow": "30D",
                "watchlist": ["BTC", "ETH"],
                "trendFilter": "all",
                "primaryAsset": "BTC",
                "priceDates": ["2026-01-01T00:00:00+00:00"],
                "priceValues": [100.0],
                "priceSource": "mock",
                "kpis": [
                    {
                        "label": "Market Cap Tracked",
                        "value": "$1.91T",
                        "delta": "+2.8%",
                        "color": "#12b76a",
                    }
                ],
                "riskScores": [62],
                "riskLabels": ["Market"],
                "riskColors": ["#f79009"],
                "alerts": ["BTC below 63,500"],
                "news": ["SEC proposal"],
            },
        )

    def test_snapshot_rejects_unknown_time_window(self):
        resp = client.get("/api/snapshot?window=1H&assets=BTC&source=mock")

        self.assertEqual(resp.status_code, 422)


class ApiPriceTrendTests(unittest.TestCase):
    def setUp(self):
        market_service._CACHE.clear()

    @patch("src.data.market.service.fetch_ccxt_series")
    def test_price_trend_returns_expected_structure(self, mock_ccxt):
        mock_ccxt.return_value = ([datetime(2024, 1, 1)], [100.0], "binance")
        resp = client.get("/api/price-trend?asset=BTC&days=30")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("prices", data)
        self.assertIn("asset", data)
        self.assertEqual(data["source"], "binance")


class ApiNewsTests(unittest.TestCase):
    @patch("src.data.news.ingestion._parse_feed", return_value=[])
    def test_news_returns_list(self, _mock_parse):
        resp = client.get("/api/news?watchlist=BTC&limit=5")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)

    @patch("src.data.news.ingestion._parse_feed", return_value=[])
    def test_news_respects_limit(self, _mock_parse):
        resp = client.get("/api/news?watchlist=BTC&limit=1")
        self.assertEqual(resp.status_code, 200)
        self.assertLessEqual(len(resp.json()), 1)

    @patch("src.data.news.ingestion.load_news_items")
    def test_news_uses_shared_item_contract(self, mock_load):
        mock_load.return_value = [
            FeedItem(
                id="news-1",
                source="https://www.sec.gov/news/pressreleases.rss",
                published_at=datetime(2026, 11, 20, 18, 3, 24, tzinfo=UTC),
                title="SEC news",
                url="https://www.sec.gov/newsroom/press-releases/2026-117",
                tags=["sec"],
            )
        ]

        resp = client.get("/api/news?watchlist=BTC&limit=1")

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            [
                {
                    "id": "news-1",
                    "source": "https://www.sec.gov/news/pressreleases.rss",
                    "publishedAt": "2026-11-20T18:03:24+00:00",
                    "title": "SEC news",
                    "url": "https://www.sec.gov/newsroom/press-releases/2026-117",
                    "tags": ["sec"],
                }
            ],
        )


class ApiAlertsTests(unittest.TestCase):
    def setUp(self):
        market_service._CACHE.clear()

    @patch("src.data.market.service.fetch_ccxt_series", return_value=None)
    def test_alerts_returns_structure(self, _mock_ccxt):
        resp = client.get("/api/alerts?window=30D&assets=BTC")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("alerts", resp.json())


class ApiNewsletterSubscribeTests(unittest.TestCase):
    @patch("src.data.newsletter.store.save_subscription")
    def test_subscribe_accepts_valid_email(self, mock_save):
        mock_save.return_value = unittest.mock.Mock(email="test@test.com")
        resp = client.post(
            "/api/newsletter/subscribe",
            json={"email": "test@test.com", "frequency": "Weekly", "format": "Summary"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])

    def test_subscribe_rejects_missing_email(self):
        resp = client.post("/api/newsletter/subscribe", json={})
        self.assertEqual(resp.status_code, 422)


class ApiNewsletterPrivacyTests(unittest.TestCase):
    def test_subscriber_list_is_not_exposed(self):
        resp = client.get("/api/newsletter/subscriptions")
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
