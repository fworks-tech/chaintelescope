import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_NOTE = REPO_ROOT / "docs" / "source-inventory-m4.md"
ARCH_DOC = REPO_ROOT / "docs" / "Architecture.md"
REPO_ISSUES_URL = "https://github.com/fworks-tech/chain-telescope/issues"

REQUIRED_SECTIONS = (
    "## 1) Crypto market data",
    "## 2) News and RSS/feed sources",
    "## 3) Investors and capital markets signals",
    "## 4) Core developers and protocol communities",
    "## 5) Cross-cutting strategy",
)

ISSUE_MAPPING = {
    14: (
        "wire sidebar filters to dashboard data",
        "watchlist/time-window filters",
    ),
    15: (
        "market data ingestion module",
        "Binance default + CoinGecko fallback",
    ),
    16: (
        "news feed ingestion module",
        "NewsAPI fallback",
    ),
    17: (
        "alerts rules engine (MVP)",
        "confidence metadata",
    ),
    18: (
        "newsletter persistence and delivery (MVP)",
        "cached fallback content",
    ),
}


class SourceInventoryNoteTests(unittest.TestCase):
    def test_note_exists_and_has_required_sections(self):
        content = SOURCE_NOTE.read_text(encoding="utf-8")
        for section in REQUIRED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, content)

    def test_issue_mapping_links_and_scope(self):
        content = SOURCE_NOTE.read_text(encoding="utf-8")
        for issue_number, (title_fragment, linkage_fragment) in ISSUE_MAPPING.items():
            with self.subTest(issue=issue_number):
                self.assertIn(f"{REPO_ISSUES_URL}/{issue_number}", content)
                self.assertIn(title_fragment, content)
                self.assertIn(linkage_fragment, content)

    def test_newsapi_name_is_consistent(self):
        content = SOURCE_NOTE.read_text(encoding="utf-8")
        self.assertRegex(content, r"\| NewsAPI / GDELT APIs \| API \|")
        self.assertRegex(
            content,
            r"\| Alerts/news feed \| RSS/Atom via `httpx` \+ `xml\.etree\.ElementTree` \(crypto \+ official blogs \+ macro\) \| NewsAPI \(free tier\) \|",
        )
        self.assertNotRegex(content, r"News API aggregator")
        self.assertNotRegex(content, r"News API \(free tier\)")
        self.assertNotRegex(content, r"NewsApi")
        self.assertNotRegex(content, r"\bnewsapi\b")

    def test_architecture_doc_links_to_source_note(self):
        content = ARCH_DOC.read_text(encoding="utf-8")
        self.assertRegex(
            content,
            r"\[`docs/source-inventory-m4\.md`\]\(source-inventory-m4\.md\)",
        )
        self.assertTrue(SOURCE_NOTE.exists())


if __name__ == "__main__":
    unittest.main()
