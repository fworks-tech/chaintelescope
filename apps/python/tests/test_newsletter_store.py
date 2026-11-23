import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from src.data.newsletter.store import list_subscriptions, save_subscription


class NewsletterStoreTests(unittest.TestCase):
    def test_save_subscription_writes_json(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            data_dir = Path(tmp_dir)
            subscriptions_file = data_dir / "newsletter_subscriptions.json"
            subscriptions_file.write_text("[]", encoding="utf-8")
            with patch("src.data.newsletter.store.DATA_DIR", data_dir):
                with patch("src.data.newsletter.store.SUBSCRIPTIONS_FILE", subscriptions_file):
                    record = save_subscription("user@example.com", "Weekly", "Summary")
                    self.assertEqual(record.email, "user@example.com")
                    payload = subscriptions_file.read_text(encoding="utf-8")
                    self.assertIn("user@example.com", payload)

    def test_save_subscription_deduplicates_by_email(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            data_dir = Path(tmp_dir)
            subscriptions_file = data_dir / "newsletter_subscriptions.json"
            subscriptions_file.write_text("[]", encoding="utf-8")
            with patch("src.data.newsletter.store.DATA_DIR", data_dir):
                with patch("src.data.newsletter.store.SUBSCRIPTIONS_FILE", subscriptions_file):
                    save_subscription("same@email.com", "Daily", "Summary")
                    save_subscription("same@email.com", "Weekly", "Deep Dive")
                    subs = list_subscriptions()
                    self.assertEqual(len(subs), 1)
                    self.assertEqual(subs[0].frequency, "Weekly")

    def test_list_subscriptions_returns_empty_on_corrupted_file(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            data_dir = Path(tmp_dir)
            subscriptions_file = data_dir / "newsletter_subscriptions.json"
            subscriptions_file.write_text("not valid json", encoding="utf-8")
            with patch("src.data.newsletter.store.DATA_DIR", data_dir):
                with patch("src.data.newsletter.store.SUBSCRIPTIONS_FILE", subscriptions_file):
                    subs = list_subscriptions()
                    self.assertEqual(subs, [])

    def test_save_subscription_returns_none_on_write_error(self):
        mock_file = unittest.mock.MagicMock()
        mock_file.exists.return_value = True
        mock_file.read_text.return_value = "[]"
        mock_file.parent = Path("/tmp")
        mock_file.write_text.side_effect = OSError("disk full")
        with patch("src.data.newsletter.store.SUBSCRIPTIONS_FILE", mock_file):
            with patch("src.data.newsletter.store.DATA_DIR", Path("/tmp")):
                result = save_subscription("test@test.com", "Daily", "Summary")
                self.assertIsNone(result)
