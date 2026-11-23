import unittest
from types import SimpleNamespace
from unittest.mock import patch

from src.components.feed_panels import render_news_panel


class FeedPanelsTests(unittest.TestCase):
    @patch("src.components.feed_panels.st.markdown")
    def test_render_news_panel_escapes_untrusted_html(self, mock_markdown):
        snapshot = SimpleNamespace(news=["safe", "<script>alert(1)</script>"])
        render_news_panel(snapshot)
        rendered = mock_markdown.call_args.args[0]
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", rendered)
        self.assertNotIn("<script>alert(1)</script>", rendered)


if __name__ == "__main__":
    unittest.main()
