"""Emit a read-only Spark SQL regression using the notebook's actual view SQL.

Run this query on the governed SQL warehouse; failures must be zero before
publishing a county-feed change. No production rows or views are modified.
"""
import ast
from pathlib import Path

source = (Path(__file__).resolve().parents[1] / "databricks/notebooks/tool_context_views.py").read_text()
tree = ast.parse(source)
context = {"target": "fixture", "WINDOW_AS_OF_SQL": "DATE '2026-11-19'"}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name == "sql_safe_date":
        exec(compile(ast.Module(body=[node], type_ignores=[]), "date-helper", "exec"), context)

queries = {}
for node in tree.body:
    if not isinstance(node, ast.Expr) or not isinstance(node.value, ast.Call):
        continue
    call = node.value
    if isinstance(call.func, ast.Name) and call.func.id == "create_view" and isinstance(call.args[0], ast.Constant):
        name = call.args[0].value
        if name in ("v_tool_resident_profile", "v_tool_current_resident_county_by_community"):
            queries[name] = eval(compile(ast.Expression(call.args[1]), "view-sql", "eval"), context).replace("fixture.", "")
assert len(queries) == 2

print("""
WITH fixture_residents AS (
 SELECT * FROM VALUES
 ('337','same','1!11!2026',1),
 ('343','same','2!11!2026',1),
 ('337','private','2026-11-03',1),
 ('337','blank','2026-11-04',1),
 ('337','unmatched','2026-11-05',1),
 ('337','excluded','2!1!2026',0)
 AS r(Facility,Res_Number,Admit_Date,is_countable_resident)
), v_active_residents AS (
 SELECT r.*, 'Test' AS First_Name, Res_Number AS Last_Name, 40 AS Age,
  10 AS LOS_Days, 'Synthetic community' AS Facility_Name,
  cast(NULL AS string) AS Unit_Number, cast(NULL AS string) AS Care_Level,
  cast(NULL AS string) AS Payor_Text, cast(NULL AS string) AS Primary_Diagnosis,
  cast(NULL AS string) AS Physician_Name, cast(NULL AS string) AS Diet
 FROM fixture_residents r
), v_tool_resident_countability_audit AS (
 SELECT Facility,Res_Number,is_countable_resident FROM fixture_residents
), v_admittance_history AS (
 SELECT * FROM VALUES
 ('337','same',DATE '2025-01-01','Los Angeles',1,'2025-01-01'),
 ('337','same',DATE '2026-11-01','Santa Clara County',2,'2026-11-01'),
 ('337','same',DATE '2026-11-01','Santa Clara County',3,'2026-11-02'),
 ('343','same',DATE '2026-11-02','San Bernadino',4,'2026-11-02'),
 ('337','private',DATE '2026-11-03','Private Pay',5,'2026-11-03'),
 ('337','blank',DATE '2026-11-04','',6,'2026-11-04'),
 ('337','excluded',DATE '2026-01-02','Alameda',7,'2026-01-02')
 AS h(Facility,Res_Number,Admit_Date_dt,County_Admitted_From,Unique_ID,__TIMESTAMP)
), v_tool_resident_profile AS (
""" + queries["v_tool_resident_profile"] + """
), actual AS (
""" + queries["v_tool_current_resident_county_by_community"] + """
), expected AS (
 SELECT * FROM VALUES ('337','Santa Clara',1),('343','San Bernardino',1),('337',cast(NULL AS string),3)
 AS e(Facility,client_county,resident_count)
), differences AS (
 (SELECT Facility,client_county,resident_count FROM actual EXCEPT ALL SELECT * FROM expected)
 UNION ALL
 (SELECT * FROM expected EXCEPT ALL SELECT Facility,client_county,resident_count FROM actual)
), date_differences AS (
 SELECT * FROM v_tool_resident_profile
 WHERE (Facility='337' AND Res_Number='same' AND Admit_Date <> '2026-11-01')
    OR (Facility='343' AND Res_Number='same' AND Admit_Date <> '2026-11-02')
)
SELECT (SELECT count(*) FROM differences) + (SELECT count(*) FROM date_differences) AS failures,
       (SELECT count(*) FROM v_tool_resident_profile) AS residents,
       (SELECT sum(resident_count) FROM actual) AS accounted_residents
""")
