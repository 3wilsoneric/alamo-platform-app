"""Execute the actual new view projection against isolated source events."""
import ast
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parent.parent
tree = ast.parse((root / "databricks/notebooks/tool_context_views.py").read_text())
call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name) and node.func.id == "create_view"
            and isinstance(node.args[0], ast.Constant)
            and node.args[0].value == "v_tool_mar_daily_by_community_medication")
query = eval(compile(ast.Expression(call.args[1]), "view-projection", "eval"), {"target": "gold"})
db = sqlite3.connect(":memory:")
db.row_factory = sqlite3.Row
db.execute("attach ':memory:' as gold")
db.execute("""create table gold.v_mar_administration_detail (
  facility_id text, facility_name text, administration_date text,
  medication_name text, is_prn integer, administration_outcome text, is_refusal integer)""")
events = [
    ("337", "Community A", "2026-11-01", "Medicine A 5 mg", 0, "given", 0),
    ("337", "Community A", "2026-11-01", "Medicine A 5 mg", 0, "given", 0),
    ("337", "Community A", "2026-11-01", "Medicine A 5 mg", 0, "not_given", 1),
    ("337", "Community A", "2026-11-01", "Medicine A 5 mg", 0, "unknown", 0),
    ("337", "Community A", "2026-11-01", "Medicine A 5 mg", 1, "not_given", 1),
    ("337", "Community A", "2026-11-01", "Medicine A 5 mg", 1, "given", 0),
    ("337", "Community A", "2026-11-02", "Medicine A 5 mg", 0, "not_given", 1),
    ("337", "Community A", "2026-11-01", "Medicine A 10 mg", 0, "not_given", 1),
    ("345", "Community B", "2026-11-01", "Medicine A 5 mg", 0, "given", 0),
    ("345", "Community B", "2026-11-02", "Medicine A 5 mg", 1, "not_given", 1),
]
db.executemany("insert into gold.v_mar_administration_detail values (?,?,?,?,?,?,?)", events)
db.execute("create view gold.medication_daily as " + query)
rows = [dict(row) for row in db.execute("select * from gold.medication_daily")]
assert len(rows) == 5
assert sum(row["administration_count"] for row in rows) == len(events)
for row in rows:
    assert row["scheduled_count"] == row["given_count"] + row["not_given_count"] + row["pending_count"]
    assert row["refusal_count"] == row["scheduled_refusal_count"] + row["prn_refusal_count"]
matched = db.execute("""select sum(scheduled_refusal_count) refusals, sum(scheduled_count) scheduled
  from gold.medication_daily where facility_id='337' and medication_name='Medicine A 5 mg'
  and administration_date between '2026-11-01' and '2026-11-02'""").fetchone()
assert tuple(matched) == (2, 5), "Scheduled rate must be 2/5, not all-refusals 3/5 or a mean of daily rates"
only_prn = next(row for row in rows if row["facility_id"] == "345" and row["administration_date"] == "2026-11-02")
assert only_prn["scheduled_count"] == only_prn["scheduled_refusal_count"] == 0
assert only_prn["prn_refusal_count"] == 1
assert db.execute("select count(*) from gold.medication_daily where administration_date < '2026-11-01'").fetchone()[0] == 0
print("Medication daily grain: exact dates, strengths, community isolation, weighted scheduled rates, pending and PRN separation passed.")
