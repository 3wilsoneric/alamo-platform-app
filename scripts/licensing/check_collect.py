"""Offline checks for the collection pilot's change detection and validation."""
import sqlite3
import unittest
import tempfile
import tarfile
import io
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout
from collect import run, FACILITIES
from restore import restore
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


class CloudRestoreChecks(unittest.TestCase):
    def test_partial_run_never_advances_comparison_history(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def collect(_fetch, number, _community, _platform):
                if number == FACILITIES[-1][0]:
                    raise ValueError("Source unavailable")
                row = record("report", "a", {"text": "new"}, "raw.html", "https://example.test", "now")
                return [row], {"report_count": 1}
            with patch("collect.collect_facility", side_effect=collect), redirect_stdout(io.StringIO()):
                self.assertEqual(run(root, 0.7), 1)
            db = sqlite3.connect(root / "baseline.sqlite")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM entities").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM changes").fetchone()[0], 0)
            self.assertFalse((root / "latest-complete.txt").exists())
            db.close()

    def test_restore_rejects_traversal_and_links(self):
        for name, kind in [("../outside", tarfile.REGTYPE), ("data/link", tarfile.SYMTYPE)]:
            with tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                archive = root / "archive.tar.gz"
                with tarfile.open(archive, "w:gz") as output:
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    entry.linkname = "/etc/passwd" if kind == tarfile.SYMTYPE else ""
                    output.addfile(entry)
                with self.assertRaisesRegex(ValueError, "Unsafe"):
                    restore(archive, root / "restored")

    def test_valid_restart_archive_restores_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "archive.tar.gz"
            with tarfile.open(archive, "w:gz") as output:
                for name, content in [("data/baseline.sqlite", b"fixture"), ("data/latest-complete.txt", b"run-1")]:
                    entry = tarfile.TarInfo(name)
                    entry.size = len(content)
                    output.addfile(entry, io.BytesIO(content))
            restore(archive, root / "restored")
            self.assertEqual((root / "restored/data/latest-complete.txt").read_text(), "run-1")
            with self.assertRaisesRegex(ValueError, "empty"):
                restore(archive, root / "restored")


if __name__ == "__main__":
    unittest.main()
