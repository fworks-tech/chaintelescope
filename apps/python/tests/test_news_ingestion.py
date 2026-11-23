import unittest
import xml.etree.ElementTree as ET
from datetime import datetime

from src.data.news.ingestion import (
    ATOM_NS,
    _parse_atom_entry,
    _parse_rss_entry,
)

ATOM_XML = """<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Bitcoin ETF inflows surge</title>
    <link href="https://example.com/btc-etf"/>
    <published>2026-07-05T12:00:00Z</published>
    <category term="BTC"/>
    <category term="ETF"/>
  </entry>
  <entry>
    <title>Ethereum layer-2 activity hits新高</title>
    <link href="https://example.com/eth-l2"/>
    <updated>2026-07-05T10:30:00Z</updated>
    <category term="ETH"/>
  </entry>
  <entry>
    <title></title>
    <link href="https://example.com/empty"/>
  </entry>
  <entry>
    <title>Unparseable date</title>
    <link href="https://example.com/bad-date"/>
    <published>not-a-valid-date</published>
  </entry>
  <entry>
    <title>Atom entry with no link</title>
  </entry>
</feed>"""

RSS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Solana breaks $200 resistance</title>
      <link>https://example.com/sol-200</link>
      <pubDate>Mon, 06 Jul 2026 14:00:00 GMT</pubDate>
      <category>SOL</category>
      <category>DeFi</category>
    </item>
    <item>
      <title></title>
      <link>https://example.com/empty</link>
      <pubDate>Sun, 05 Jul 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <title>RSS item with bad date</title>
      <link>https://example.com/bad-date</link>
      <pubDate>not a real date</pubDate>
    </item>
    <item>
      <title>RSS item with no link</title>
    </item>
  </channel>
</rss>"""

SOURCE_URL = "https://example.com/feed"


def _atom_entries():
    root = ET.fromstring(ATOM_XML)
    return root.findall(f"{{{ATOM_NS}}}entry")


def _rss_items():
    root = ET.fromstring(RSS_XML)
    return root.findall(".//item")


class ParseAtomEntryTests(unittest.TestCase):
    def test_returns_feed_item_with_title_link_tags_and_date(self):
        entries = _atom_entries()
        item = _parse_atom_entry(entries[0], SOURCE_URL)
        self.assertIsNotNone(item)
        self.assertEqual(item.title, "Bitcoin ETF inflows surge")
        self.assertEqual(item.url, "https://example.com/btc-etf")
        self.assertEqual(item.tags, ["BTC", "ETF"])
        self.assertIsInstance(item.published_at, datetime)

    def test_uses_updated_when_no_published(self):
        entries = _atom_entries()
        item = _parse_atom_entry(entries[1], SOURCE_URL)
        self.assertIsNotNone(item)
        self.assertEqual(item.title, "Ethereum layer-2 activity hits新高")
        self.assertEqual(item.tags, ["ETH"])

    def test_returns_none_for_empty_title(self):
        entries = _atom_entries()
        item = _parse_atom_entry(entries[2], SOURCE_URL)
        self.assertIsNone(item)

    def test_falls_back_to_now_on_unparseable_date(self):
        entries = _atom_entries()
        item = _parse_atom_entry(entries[3], SOURCE_URL)
        self.assertIsNotNone(item)
        self.assertEqual(item.title, "Unparseable date")

    def test_uses_source_url_when_link_missing(self):
        entries = _atom_entries()
        item = _parse_atom_entry(entries[4], SOURCE_URL)
        self.assertIsNotNone(item)
        self.assertEqual(item.title, "Atom entry with no link")
        self.assertEqual(item.url, SOURCE_URL)


class ParseRssEntryTests(unittest.TestCase):
    def test_returns_feed_item_with_title_link_tags_and_date(self):
        items = _rss_items()
        item = _parse_rss_entry(items[0], SOURCE_URL)
        self.assertIsNotNone(item)
        self.assertEqual(item.title, "Solana breaks $200 resistance")
        self.assertEqual(item.url, "https://example.com/sol-200")
        self.assertEqual(item.tags, ["SOL", "DeFi"])
        self.assertIsInstance(item.published_at, datetime)

    def test_returns_none_for_empty_title(self):
        items = _rss_items()
        item = _parse_rss_entry(items[1], SOURCE_URL)
        self.assertIsNone(item)

    def test_falls_back_to_now_on_unparseable_date(self):
        items = _rss_items()
        item = _parse_rss_entry(items[2], SOURCE_URL)
        self.assertIsNotNone(item)
        self.assertEqual(item.title, "RSS item with bad date")

    def test_uses_source_url_when_link_missing(self):
        items = _rss_items()
        item = _parse_rss_entry(items[3], SOURCE_URL)
        self.assertIsNotNone(item)
        self.assertEqual(item.title, "RSS item with no link")
        self.assertEqual(item.url, SOURCE_URL)


if __name__ == "__main__":
    unittest.main()
