import hashlib
import json
import unittest
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from src.data.news.models import FeedItem
from src.data.news.writer import (
    canonical_payload,
    content_hash,
    is_http_url,
    open_conn,
    write_news_items,
)


def _item(**overrides):
    base = {
        "id": "abc123",
        "source": "https://www.coindesk.com/arc/outboundfeeds/rss/",
        "published_at": datetime(2026, 10, 26, 12, 0, 0, tzinfo=UTC),
        "title": "ETF flows rebound",
        "url": "https://example.com/etf-flows",
        "tags": ["BTC", "ETF"],
    }
    base.update(overrides)
    return FeedItem(**base)


class CanonicalHashTests(unittest.TestCase):
    def test_canonical_payload_matches_node_pre_image(self):
        self.assertEqual(
            canonical_payload(_item()),
            '{"publishedAt":"2026-10-26T12:00:00+00:00",'
            '"title":"ETF flows rebound",'
            '"url":"https://example.com/etf-flows"}',
        )

    def test_content_hash_is_sha256_of_canonical_bytes(self):
        canonical = canonical_payload(_item())
        self.assertEqual(
            content_hash(canonical),
            hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        )
        # Pinned vector: if the Node rule changes, both sides change together.
        self.assertEqual(
            content_hash(canonical),
            hashlib.sha256(
                b'{"publishedAt":"2026-10-26T12:00:00+00:00",'
                b'"title":"ETF flows rebound",'
                b'"url":"https://example.com/etf-flows"}'
            ).hexdigest(),
        )


class WriteNewsItemsTests(unittest.TestCase):
    def _conn(self, rows: list):
        cur = MagicMock()
        cur.fetchone.side_effect = rows
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        return conn, cur

    def test_counts_created_vs_deduped(self):
        conn, cur = self._conn([{"id": "x"}, None])
        result = write_news_items(conn, [_item(), _item(title="Other")])
        self.assertEqual(result, {"created": 1, "deduped": 1})
        conn.commit.assert_called_once_with()
        self.assertEqual(cur.execute.call_count, 2)

    def test_conflict_counts_as_deduped(self):
        conn, _ = self._conn([None])
        result = write_news_items(conn, [_item()])
        self.assertEqual(result, {"created": 0, "deduped": 1})

    def test_empty_input_commits_nothing(self):
        conn, cur = self._conn([])
        result = write_news_items(conn, [])
        self.assertEqual(result, {"created": 0, "deduped": 0})
        cur.execute.assert_not_called()

    def test_row_maps_feed_item_columns(self):
        conn, cur = self._conn([{"id": "x"}])
        write_news_items(conn, [_item()])
        args, _ = cur.execute.call_args
        params = args[1]
        self.assertEqual(
            params[:5],
            (
                "ETF flows rebound",
                "https://example.com/etf-flows",
                "https://www.coindesk.com/arc/outboundfeeds/rss/",
                ["btc", "etf"],
                datetime(2026, 10, 26, 12, 0, 0, tzinfo=UTC),
            ),
        )
        payload = json.loads(params[6])
        self.assertEqual(payload["title"], "ETF flows rebound")
        self.assertEqual(params[5], content_hash(params[6]))

    def test_mid_loop_error_propagates_without_commit(self):
        conn, cur = self._conn([{"id": "x"}])
        cur.execute.side_effect = [None, RuntimeError("db gone")]
        with self.assertRaises(RuntimeError):
            write_news_items(conn, [_item(), _item(title="Other")])
        conn.commit.assert_not_called()


class OpenConnTests(unittest.TestCase):
    def test_full_database_url_wins(self):
        with (
            patch.dict(
                "os.environ",
                {"DATABASE_URL": "postgres://u:p@h:5432/db"},
                clear=False,
            ),
            patch("psycopg.connect") as connect,
        ):
            open_conn()
            connect.assert_called_once_with("postgres://u:p@h:5432/db")

    def test_parts_become_kwargs_with_required_tls(self):
        env = {
            "DATABASE_URL": "",
            "PGHOST": "db.local",
            "PGPORT": "5433",
            "PGDATABASE": "ct",
            "PGUSER": "writer",
            "PGPASSWORD": "s3cret",
        }
        with patch.dict("os.environ", env, clear=False):
            with patch("psycopg.connect") as connect:
                open_conn()
                connect.assert_called_once_with(
                    host="db.local",
                    port=5433,
                    dbname="ct",
                    user="writer",
                    password="s3cret",
                    sslmode="require",
                )


class IsHttpUrlTests(unittest.TestCase):
    def test_allowlists_http_schemes_only(self):
        self.assertTrue(is_http_url("https://example.com/x"))
        self.assertTrue(is_http_url("http://example.com/x"))
        self.assertFalse(is_http_url("javascript:alert(1)"))
        self.assertFalse(is_http_url("data:text/html,<h1>x</h1>"))
        self.assertFalse(is_http_url("notaurl"))
