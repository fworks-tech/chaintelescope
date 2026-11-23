import unittest
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from src.api import app

client = TestClient(app)


class ApiHealthTests(unittest.TestCase):
    def test_health_returns_ok(self):
        resp = client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "ok"})


class ApiSnapshotTests(unittest.TestCase):
    @patch("src.data.market.service.fetch_ccxt_series", return_value=None)
    @patch("src.data.news.ingestion._parse_feed", return_value=[])
    def test_snapshot_returns_expected_structure(self, _mock_news, _mock_ccxt):
        resp = client.get("/api/snapshot?window=30D&assets=BTC&source=mock")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("primary_asset", data)
        self.assertIn("price_values", data)
        self.assertIn("kpis", data)
        self.assertIn("alerts", data)

    def test_snapshot_with_multiple_assets(self):
        resp = client.get("/api/snapshot?window=30D&assets=BTC,ETH,SOL")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("BTC", data["watchlist"])


class ApiPriceTrendTests(unittest.TestCase):
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


class ApiAlertsTests(unittest.TestCase):
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


class ApiNewsletterSubscriptionsTests(unittest.TestCase):
    @patch("src.data.newsletter.store.list_subscriptions", return_value=[])
    def test_subscriptions_returns_list(self, _mock_list):
        resp = client.get("/api/newsletter/subscriptions")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)


if __name__ == "__main__":
    unittest.main()
