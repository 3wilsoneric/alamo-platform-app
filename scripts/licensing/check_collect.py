"""Offline checks for the collection pilot's change detection and validation."""
import sqlite3
import unittest
from collect import SCHEMA, apply_records, complaint_rows, parse_report, record, validate_index


class CollectorChecks(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SCHEMA)
        self.number = "079201030"

    def tearDown(self):
        self.db.close()

    def make_row(self, identity="a", value="original"):
        return record("report", identity, {"text": value}, "raw.html", "https://example.test", "2026-09-28")

    def apply(self, run_id, rows):
        summary = {"report_count": len(rows)}
        with self.db:
            apply_records(self.db, run_id, self.number, rows, summary)
        return summary["changes"]

    def test_baseline_idempotence_revision_backfill_disappearance_reappearance(self):
        a, b = self.make_row(), self.make_row("b")
        self.assertEqual(self.apply("1", [a, b]), {"baseline": 2})
        self.assertEqual(self.apply("2", [b, a]), {})
        changed = self.make_row(value="corrected")
        self.assertEqual(self.apply("3", [changed, b, self.make_row("older-backfill")]), {"revised": 1, "new": 1})
        self.assertEqual(self.apply("4", [changed, b]), {"no_longer_listed": 1})
        self.assertEqual(self.apply("5", [changed, b, self.make_row("older-backfill")]), {"reappeared": 1})
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM versions").fetchone()[0], 4)

    def test_empty_response_preserves_last_good_state(self):
        self.apply("1", [self.make_row()])
        with self.assertRaisesRegex(ValueError, "empty"):
            self.apply("2", [])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM current_records").fetchone()[0], 1)

    def test_duplicate_identity_does_not_partially_commit(self):
        self.apply("1", [self.make_row()])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.apply("2", [self.make_row("b"), self.make_row("b")])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM versions").fetchone()[0], 1)

    def test_count_and_facility_validation(self):
        with self.assertRaisesRegex(ValueError, "count"):
            validate_index({"COUNT": 1, "REPORTARRAY": []}, self.number)
        with self.assertRaisesRegex(ValueError, "different"):
            validate_index({"COUNT": 1, "REPORTARRAY": [{"FACILITYNUMBER": "197610805"}]}, self.number)

    def test_html_error_page_rejected(self):
        with self.assertRaisesRegex(ValueError, "matching report"):
            parse_report(b"<html><body>Service unavailable</body></html>", {
                "FACILITYNUMBER": self.number, "REPORTTITLE": "FACILITY EVALUATION REPORT"})

    def test_null_complaints_only_valid_with_explicit_zero(self):
        self.assertEqual(complaint_rows({"CMPCOUNT": 0, "COMPLAINTARRAY": None}), [])
        self.assertEqual(complaint_rows({"CMPCOUNT": 0, "COMPLAINTARRAY": [None]}), [])
        with self.assertRaisesRegex(ValueError, "count"):
            complaint_rows({"CMPCOUNT": 1, "COMPLAINTARRAY": None})


if __name__ == "__main__":
    unittest.main()
