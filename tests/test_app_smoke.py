import importlib
import pathlib
import unittest

from app import _greeting_for_hour
from streamlit.testing.v1 import AppTest

# AppTest resolves relative paths against the calling file, not the CWD.
REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]


class AppSmokeTests(unittest.TestCase):
    def test_app_imports(self):
        importlib.import_module("app")

    def test_src_modules_compile(self):
        root = REPO_ROOT / "src"
        for path in root.rglob("*.py"):
            compile(path.read_text(encoding="utf-8"), str(path), "exec")

    def test_dashboard_entry_renders_without_exception(self):
        app_test = AppTest.from_file(str(REPO_ROOT / "app.py"))
        app_test.run(timeout=15)
        self.assertEqual(len(app_test.exception), 0)
        self.assertGreater(len(app_test.get("markdown")), 0)

    def test_navigation_renders_dashboard_by_default(self):
        app_test = AppTest.from_file(str(REPO_ROOT / "app.py"))
        app_test.run(timeout=15)
        self.assertGreater(len(app_test.get("plotly_chart")), 0)

    def test_alerts_page_renders_via_navigation(self):
        app_test = AppTest.from_file(str(REPO_ROOT / "pages" / "alerts.py"))
        app_test.run(timeout=15)
        self.assertEqual(len(app_test.get("plotly_chart")), 0)
        self.assertTrue(any("alerts" in item.value.lower() for item in app_test.get("markdown")))

    def test_greeting_excludes_hardcoded_username(self):
        app_test = AppTest.from_file(str(REPO_ROOT / "app.py"))
        app_test.run(timeout=15)
        self.assertFalse(any("Richard" in item.value for item in app_test.get("markdown")))
        self.assertTrue(
            any(
                phrase in item.value
                for item in app_test.get("markdown")
                for phrase in ("Good Morning", "Good Afternoon", "Good Evening")
            )
        )

    def test_greeting_hour_boundaries(self):
        self.assertEqual(_greeting_for_hour(4), "Good Evening")
        self.assertEqual(_greeting_for_hour(5), "Good Morning")
        self.assertEqual(_greeting_for_hour(11), "Good Morning")
        self.assertEqual(_greeting_for_hour(12), "Good Afternoon")
        self.assertEqual(_greeting_for_hour(17), "Good Afternoon")
        self.assertEqual(_greeting_for_hour(18), "Good Evening")


if __name__ == "__main__":
    unittest.main()
