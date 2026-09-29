#!/usr/bin/env python3
"""CCLD source collector. Python stdlib + curl; publishing is handled separately."""
import argparse
import collections
import datetime as dt
import fcntl
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import time
import uuid

API = "https://www.ccld.dss.ca.gov/transparencyapi/api/"
FACILITIES = [
    ("079201030", "San Pablo", "337"),
    ("197610805", "Santa Clarita", "345"),
    ("502701372", "Turlock", "344"),
    ("365530119", "JC Wallace House", "343"),
]
SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, started_at TEXT, finished_at TEXT, status TEXT, summary_json TEXT);
CREATE TABLE IF NOT EXISTS entities (
 facility_number TEXT, kind TEXT, entity_id TEXT, fingerprint TEXT,
 first_seen TEXT, last_seen TEXT, present INTEGER,
 PRIMARY KEY(facility_number,kind,entity_id));
CREATE TABLE IF NOT EXISTS versions (
 facility_number TEXT, kind TEXT, entity_id TEXT, fingerprint TEXT,
 first_seen TEXT, payload_json TEXT, raw_path TEXT, text_path TEXT,
 PRIMARY KEY(facility_number,kind,entity_id,fingerprint));
CREATE TABLE IF NOT EXISTS observations (
 run_id TEXT, facility_number TEXT, kind TEXT, entity_id TEXT,
 fingerprint TEXT, source_url TEXT, fetched_at TEXT,
 PRIMARY KEY(run_id,facility_number,kind,entity_id));
CREATE TABLE IF NOT EXISTS changes (
 run_id TEXT, facility_number TEXT, kind TEXT, entity_id TEXT,
 change_type TEXT, before_fingerprint TEXT, after_fingerprint TEXT);
CREATE TABLE IF NOT EXISTS facility_runs (
 run_id TEXT, facility_number TEXT, status TEXT, detail_json TEXT,
 PRIMARY KEY(run_id,facility_number));
CREATE VIRTUAL TABLE IF NOT EXISTS report_search USING fts5(
 facility_number UNINDEXED, entity_id UNINDEXED, fingerprint UNINDEXED,
 report_date UNINDEXED, body);
CREATE VIEW IF NOT EXISTS current_records AS
 SELECT e.*, v.payload_json, v.raw_path, v.text_path
 FROM entities e JOIN versions v USING(facility_number,kind,entity_id,fingerprint)
 WHERE e.present=1;
"""


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(value).hexdigest()


def iso_date(value):
    return dt.datetime.strptime(value.strip(), "%m/%d/%Y").date().isoformat()


class ReportText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.title, self.links = [], [], []
        self.suppressed = 0
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self.in_title = True
        if tag in {"script", "style", "head"}:
            self.suppressed += 1
        if tag in {"br", "p", "div", "tr", "td", "table", "li"}:
            self.parts.append("\n")
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag in {"script", "style", "head"}:
            self.suppressed = max(0, self.suppressed - 1)
        if tag in {"p", "div", "tr", "td", "table", "li"}:
            self.parts.append("\n")

    def handle_data(self, value):
        if self.in_title:
            self.title.append(value)
        if not self.suppressed:
            self.parts.append(value)

    def text(self):
        lines = (re.sub(r"[\t\r\f\v \u00a0]+", " ", line).strip()
                 for line in "".join(self.parts).split("\n"))
        return "\n".join(line for line in lines if line)


def source_id(report):
    match = re.search(r"/0/([0-9A-Fa-f]{32})(?:\?|$)", report["REPORTPAGE"])
    if not match:
        raise ValueError("Unknown source document identity; manual adapter review needed")
    return match[1].lower()


def validate_index(data, facility):
    rows = data.get("REPORTARRAY")
    if not isinstance(rows, list) or int(data.get("COUNT", -1)) != len(rows):
        raise ValueError("Report count/array mismatch")
    ids = []
    for row in rows:
        if row.get("FACILITYNUMBER") != facility:
            raise ValueError("Report belongs to a different facility")
        for key in ("CONTROLNUMBER", "REPORTTITLE", "REPORTTYPE", "REPORTDATE", "REPORTPAGE"):
            if not isinstance(row.get(key), str):
                raise ValueError(f"Missing report field: {key}")
        iso_date(row["REPORTDATE"])
        ids.append(source_id(row))
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate source document ID")
    return rows


def complaint_rows(profile):
    rows = profile.get("COMPLAINTARRAY")
    count = int(profile.get("CMPCOUNT", -1))
    # Zero complaints can be represented by a null list or a [null] placeholder.
    if count == 0 and (rows is None or rows == [None]):
        return []
    if not isinstance(rows, list) or len(rows) != count:
        raise ValueError("Complaint count/array mismatch")
    return rows


def parse_report(raw, row):
    parser = ReportText()
    parser.feed(raw.decode("utf-8-sig", errors="strict"))
    text = parser.text()
    facility = row["FACILITYNUMBER"]
    if len(text) < 300 or facility not in text or row["REPORTTITLE"] not in text:
        raise ValueError("Response is not a matching report")
    date_match = re.search(r"Report Date:\s*(\d{1,2}/\d{1,2}/\d{4})", text)
    if not date_match or iso_date(date_match[1]) != iso_date(row["REPORTDATE"]):
        raise ValueError("Report date does not match inventory; index may have moved")
    if row["CONTROLNUMBER"] and row["CONTROLNUMBER"] not in text:
        raise ValueError("Complaint control number does not match report")
    return text, "".join(parser.title).strip(), parser.links


def save_blob(root, raw, extension):
    name = Path("artifacts") / f"{digest(raw)}.{extension}"
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(raw)
    return str(name)


class Fetcher:
    def __init__(self, root, delay):
        self.root, self.delay = root, delay
        self.last = 0.0

    def get(self, url, extension):
        if not url.startswith(API):
            raise ValueError("Only the observed public CCLD API is permitted")
        time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
        result = subprocess.run([
            "curl", "--fail", "--silent", "--show-error", "--proto", "=https",
            "--connect-timeout", "15", "--max-time", "45", "--max-filesize", "20971520",
            "--retry", "2", "--retry-delay", "2", url,
        ], capture_output=True, check=True, timeout=155)
        self.last = time.monotonic()
        raw = result.stdout
        path = save_blob(self.root, raw, extension)
        return raw, path, now()


def record(kind, entity_id, payload, raw_path, source_url, fetched_at, text_path=None):
    return {"kind": kind, "entity_id": entity_id,
            "fingerprint": digest(canonical(payload).encode()), "payload": payload,
            "raw_path": raw_path, "text_path": text_path,
            "source_url": source_url, "fetched_at": fetched_at}


def collect_facility(fetch, number, community, platform_id):
    detail_url = API + "FacilityDetail/" + number
    raw, detail_path, fetched = fetch.get(detail_url, "json")
    detail = json.loads(raw)
    profile = detail["FacilityDetail"]
    if profile.get("FACILITYNUMBER") != number or not profile.get("FACILITYNAME"):
        raise ValueError("Facility identity mismatch")
    complaints = complaint_rows(profile)
    controls = [c["CONTROLNUMBER"] for c in complaints]
    if len(controls) != len(set(controls)):
        raise ValueError("Duplicate complaint control number")
    rows = [record("profile", number,
                   {"facility": {k: v for k, v in profile.items() if k != "COMPLAINTARRAY"},
                    "tso": detail.get("TSO")}, detail_path, detail_url, fetched)]
    rows.extend(record("complaint", c["CONTROLNUMBER"], c, detail_path, detail_url, fetched)
                for c in complaints)
    index_url = API + "FacilityReports/" + number
    raw_index, index_path, _ = fetch.get(index_url, "json")
    reports = validate_index(json.loads(raw_index), number)
    for index, report in enumerate(reports):
        url = API + f"FacilityReports?facNum={number}&inx={index}"
        html, html_path, observed = fetch.get(url, "html")
        text, html_title, links = parse_report(html, report)
        text_path = save_blob(fetch.root, text.encode(), "txt")
        # Index is a retrieval locator only. REPORTPAGE's host is a placeholder;
        # retain it as source metadata but never fetch it or use it as a hyperlink.
        payload = {**report, "source_document_id": source_id(report), "html_title": html_title,
                   "report_date": iso_date(report["REPORTDATE"]),
                   "text_sha256": digest(text.encode()), "unresolved_link_refs": links}
        rows.append({**record("report", source_id(report), payload, html_path, url, observed, text_path), "text": text})
        if (index + 1) % 10 == 0 or index + 1 == len(reports):
            print(f"{community}: archived {index + 1}/{len(reports)} reports", flush=True)
    # Detect index changes while downloading; never commit a mixed inventory.
    after, _, _ = fetch.get(index_url, "json")
    if canonical(json.loads(after)) != canonical(json.loads(raw_index)):
        raise ValueError("Report inventory changed mid-run; retry facility")
    after_detail, _, _ = fetch.get(detail_url, "json")
    if canonical(json.loads(after_detail)) != canonical(detail):
        raise ValueError("Facility profile changed mid-run; retry facility")
    dates = sorted(r["REPORTDATE"] for r in reports)
    dates = sorted(iso_date(d) for d in dates)
    summary = {"community": community, "facility_number": number, "platform_facility_id": platform_id,
               "licensed_name": profile["FACILITYNAME"], "license_status": profile["STATUS"],
               "report_count": len(reports), "complaint_count": len(complaints),
               "report_types": dict(collections.Counter(r["REPORTTYPE"] for r in reports)),
               "oldest_report": dates[0] if dates else None, "latest_report": dates[-1] if dates else None,
               "profile_last_visit": profile.get("LASTVISITDATE"), "inventory_path": index_path,
               "profile_path": detail_path,
               "source_url": f"https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/{number}"}
    return rows, summary


def apply_records(db, run_id, number, rows, summary):
    old = {(r[0], r[1]): (r[2], r[3]) for r in db.execute(
        "SELECT kind,entity_id,fingerprint,present FROM entities WHERE facility_number=?", (number,))}
    if any(k[0] == "report" and v[1] for k, v in old.items()) and not summary["report_count"]:
        raise ValueError("Unexpected empty report inventory; baseline preserved")
    new = {(r["kind"], r["entity_id"]): r for r in rows}
    if len(new) != len(rows):
        raise ValueError("Duplicate record key")
    changes = []
    stamp = now()
    for key, row in new.items():
        previous = old.get(key)
        change = ("baseline" if not old else "new") if previous is None else (
            "reappeared" if not previous[1] else "revised" if previous[0] != row["fingerprint"] else None)
        if change:
            changes.append((run_id, number, *key, change, previous[0] if previous else None, row["fingerprint"]))
        db.execute("INSERT OR IGNORE INTO versions VALUES (?,?,?,?,?,?,?,?)",
                   (number, *key, row["fingerprint"], stamp, canonical(row["payload"]), row["raw_path"], row["text_path"]))
        db.execute("""INSERT INTO entities VALUES (?,?,?,?,?,?,1)
            ON CONFLICT(facility_number,kind,entity_id) DO UPDATE SET
            fingerprint=excluded.fingerprint,last_seen=excluded.last_seen,present=1""",
                   (number, *key, row["fingerprint"], stamp, stamp))
        db.execute("INSERT INTO observations VALUES (?,?,?,?,?,?,?)",
                   (run_id, number, *key, row["fingerprint"], row["source_url"], row["fetched_at"]))
        if row["kind"] == "report" and row.get("text"):
            db.execute("DELETE FROM report_search WHERE facility_number=? AND entity_id=?", (number, row["entity_id"]))
            db.execute("INSERT INTO report_search VALUES (?,?,?,?,?)",
                       (number, row["entity_id"], row["fingerprint"], row["payload"]["report_date"], row["text"]))
    for key, previous in old.items():
        if key not in new and previous[1]:
            changes.append((run_id, number, *key, "no_longer_listed", previous[0], None))
            db.execute("UPDATE entities SET present=0 WHERE facility_number=? AND kind=? AND entity_id=?", (number, *key))
            if key[0] == "report":
                db.execute("DELETE FROM report_search WHERE facility_number=? AND entity_id=?", (number, key[1]))
    db.executemany("INSERT INTO changes VALUES (?,?,?,?,?,?,?)", changes)
    summary["changes"] = dict(collections.Counter(c[4] for c in changes))
    db.execute("INSERT INTO facility_runs VALUES (?,?,?,?)", (run_id, number, "complete", canonical(summary)))
    return summary


def run(root, delay):
    root.mkdir(parents=True, exist_ok=True)
    with (root / "collector.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        db = sqlite3.connect(root / "baseline.sqlite")
        db.executescript(SCHEMA)
        run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8]
        started = now()
        db.execute("INSERT INTO runs VALUES (?,?,NULL,'running',NULL)", (run_id, started))
        db.commit()
        fetch = Fetcher(root, delay)
        summaries, exports, collected = [], [], []
        for number, community, platform_id in FACILITIES:
            try:
                rows, summary = collect_facility(fetch, number, community, platform_id)
                collected.append((number, rows, summary))
                summary["status"] = "complete"
                exports.extend({"facility_number": number, "community": community,
                                "platform_facility_id": platform_id, "run_id": run_id, **r} for r in rows)
            except Exception as error:
                summary = {"facility_number": number, "community": community, "status": "failed", "error": str(error)}
                with db:
                    db.execute("INSERT INTO facility_runs VALUES (?,?,?,?)", (run_id, number, "failed", canonical(summary)))
                print(f"{community}: FAILED: {error}", flush=True)
            summaries.append(summary)
        complete = all(s["status"] == "complete" for s in summaries)
        if complete:
            try:
                # Only advance the comparison history after all four facilities
                # succeed. A failed community must not consume another's changes.
                with db:
                    for number, rows, summary in collected:
                        apply_records(db, run_id, number, rows, summary)
            except Exception as error:
                complete = False
                print(f"Collection commit FAILED: {error}", flush=True)
        result = {"run_id": run_id, "started_at": started, "finished_at": now(),
                  "status": "complete" if complete else "partial", "facilities": summaries,
                  "scope": "Public records currently exposed under the four supplied licenses",
                  "platform_published": False, "scheduled": os.environ.get("LICENSING_CLOUD_JOB") == "true", "parser_version": "ccld-pilot-1"}
        run_dir = root / "runs" / run_id
        run_dir.mkdir(parents=True)
        (run_dir / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
        (run_dir / "records.ndjson").write_text("".join(canonical(r) + "\n" for r in exports))
        with db:
            db.execute("UPDATE runs SET finished_at=?,status=?,summary_json=? WHERE id=?",
                       (result["finished_at"], result["status"], canonical(result), run_id))
        if complete:
            temp = root / "latest-complete.tmp"
            temp.write_text(run_id + "\n")
            temp.replace(root / "latest-complete.txt")
        print(json.dumps(result, indent=2), flush=True)
        db.close()
        return 0 if complete else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "output/ccld-baseline/data")
    parser.add_argument("--delay", type=float, default=0.7, help="Minimum seconds between requests")
    args = parser.parse_args()
    if args.delay < 0.5:
        parser.error("--delay must be at least 0.5 seconds")
    raise SystemExit(run(args.output.resolve(), args.delay))
