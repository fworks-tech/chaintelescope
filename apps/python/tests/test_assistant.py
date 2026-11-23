import unittest
from unittest.mock import Mock, patch

from src.components.assistant import (
    _build_context,
    _normalize_history,
    _query_model,
    _smart_context_search,
)
from src.data.dashboard_query import load_dashboard_snapshot


class AssistantUnitTests(unittest.TestCase):
    def test_normalize_history_filters_invalid_messages(self):
        messages = [
            {"role": "user", "content": " hello "},
            {"role": "assistant", "content": "ok"},
            {"role": "system", "content": "ignore"},
            {"role": "user", "content": " "},
        ]
        self.assertEqual(
            _normalize_history(messages),
            [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": "ok"},
            ],
        )

    def test_smart_context_search_returns_relevant_and_excludes_irrelevant_items(self):
        context = _build_context("30D", ["BTC", "ETH"])
        context["news"] = ["ETF flows rebound", *context["news"]]
        context["alerts"].append("Whale Activity increased this week")
        matches = _smart_context_search("Any BTC alert and ETF news update?", context)
        merged = " | ".join(matches)
        self.assertIn("BTC", merged)
        self.assertTrue(
            any("alert" in item.lower() for item in matches)
            or any("alert" in item.lower() for item in context["alerts"])
        )
        self.assertTrue(
            any("ETF" in item for item in matches) or any("ETF" in item for item in context["news"])
        )
        self.assertNotIn("Whale Activity", merged)

    def test_build_context_uses_dashboard_snapshot(self):
        snapshot = load_dashboard_snapshot("24H", ["BTC"])
        context = _build_context("24H", ["BTC"])
        self.assertEqual(context["alerts"], snapshot.alerts)
        self.assertEqual(context["news"], snapshot.news)


class AssistantIntegrationTests(unittest.TestCase):
    @patch("src.components.assistant.requests.post")
    @patch("src.components.assistant._read_secret_or_env")
    def test_query_model_includes_history_and_returns_provider_content(
        self, mock_read_secret_or_env, mock_post
    ):
        def _mock_env(name, default=None):
            values = {
                "OPENAI_API_KEY": "test-key",
                "OPENAI_BASE_URL": "https://api.openai.com/v1",
                "OPENAI_MODEL": "gpt-4o-mini",
                "OPENAI_TIMEOUT_SECONDS": "10",
            }
            return values.get(name, default)

        mock_read_secret_or_env.side_effect = _mock_env
        response = Mock()
        response.status_code = 200
        response.json.return_value = {
            "choices": [{"message": {"content": "Short grounded answer"}}]
        }
        response.raise_for_status.return_value = None
        mock_post.return_value = response

        context = _build_context("7D", ["SOL"])
        history = [
            {"role": "user", "content": "What happened to SOL?"},
            {"role": "assistant", "content": "SOL appears in the watchlist context."},
        ]
        answer = _query_model("Give me a quick alert summary", context, history=history)

        self.assertEqual(answer, "Short grounded answer")
        sent_messages = mock_post.call_args.kwargs["json"]["messages"]
        self.assertEqual(sent_messages[1]["role"], "user")
        self.assertEqual(sent_messages[2]["role"], "assistant")
        self.assertIn("Smart Matches", sent_messages[-1]["content"])
        self.assertIn("SOL", sent_messages[-1]["content"])

    @patch("src.components.assistant._read_secret_or_env")
    def test_query_model_missing_credentials_uses_safe_fallback(self, mock_read_secret_or_env):
        mock_read_secret_or_env.return_value = ""
        context = _build_context("24H", ["BTC"])
        answer = _query_model("summarize", context, history=[])
        self.assertIn("GPT provider is unavailable (missing credentials)", answer)
        self.assertIn("Watchlist: BTC", answer)
        self.assertIn("KPI snapshot", answer)
        self.assertIn("Top trending assets", answer)


if __name__ == "__main__":
    unittest.main()
