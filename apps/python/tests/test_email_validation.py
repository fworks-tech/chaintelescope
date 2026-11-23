import unittest

from src.validation.email import is_valid_email


class EmailValidationTests(unittest.TestCase):
    def test_rejects_blank_and_missing_at(self):
        self.assertFalse(is_valid_email(""))
        self.assertFalse(is_valid_email("not-an-email"))

    def test_rejects_missing_domain_dot(self):
        self.assertFalse(is_valid_email("user@example"))

    def test_rejects_none(self):
        self.assertFalse(is_valid_email(None))

    def test_rejects_non_string_types(self):
        self.assertFalse(is_valid_email(123))
        self.assertFalse(is_valid_email([]))
        self.assertFalse(is_valid_email({}))

    def test_accepts_simple_address(self):
        self.assertTrue(is_valid_email("user@example.com"))


if __name__ == "__main__":
    unittest.main()
