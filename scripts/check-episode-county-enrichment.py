"""Read-only Spark regression for the actual episode view enrichment SQL."""
import ast
from pathlib import Path
from types import SimpleNamespace
source = (Path(__file__).resolve().parents[1] / 'databricks/notebooks/tool_context_views.py').read_text()
tree = ast.parse(source)
queries = {}
context = {'source': 'fixture', 'target': 'fixture', 'WINDOW_AS_OF_SQL': "DATE '2026-11-19'", 'DATE_PARTITION_AS_OF_SQL': "DATE '2026-11-19'",
           'spark': SimpleNamespace(sql=lambda sql: None), 'create_view': lambda name, sql: queries.update({name: sql}),
           'table_columns': lambda _: {'Facility', 'Res_Number', 'Admit_Date', 'Discharge_Date', 'County_Admitted_From', 'Unique_ID', 'Previous_Living_Status'}}
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in ['_resolve_column','sql_value','sql_safe_date','sql_date','create_resident_episode_views']:
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'notebook-function', 'exec'), context)
context['create_resident_episode_views']()
query = queries['v_tool_resident_episode_history'].replace('fixture.', '')
print("""WITH res_admittance_history AS (
 SELECT * FROM VALUES
 ('337','a','1!1!2026',NULL,NULL,'one','Hospital'),
 ('337','b','2!1!2026',NULL,'Alameda','two','Home'),
 ('337','c','3!1!2026',NULL,NULL,'three','Hospital'),
 ('337','d','4!1!2026',NULL,NULL,'four','Hospital')
 AS r(Facility,Res_Number,Admit_Date,Discharge_Date,County_Admitted_From,Unique_ID,Previous_Living_Status)
), report_admission_county_resolutions AS (
 SELECT * FROM VALUES
 ('one','337','a',DATE '2026-01-01','Contra Costa','Reviewed source'),
 ('one','337','a',DATE '2026-01-01','Contra Costa','Reviewed source again'),
 ('two','337','b',DATE '2026-01-02','Los Angeles','Older correction'),
 ('three','343','c',DATE '2026-01-03','Los Angeles','Wrong community'),
 ('four','337','d',DATE '2026-01-04','Los Angeles','Conflicting correction'),
 ('four','337','d',DATE '2026-01-04','Santa Clara','Conflicting correction')
 AS r(history_id,facility_id,resident_id,admit_date,county,evidence)
), v_tool_resident_countability_audit AS (
 SELECT Facility,Res_Number,'Synthetic community' AS Facility_Name,'Synthetic client' AS resident_name,1 AS is_countable_resident FROM res_admittance_history
), v_tool_resident_profile AS (
 SELECT Facility,Res_Number,Facility_Name,resident_name FROM v_tool_resident_countability_audit
), actual AS (
""" + query + """
), expected AS (
 SELECT * FROM VALUES ('a','Contra Costa'),('b','Alameda'),('c',cast(NULL AS string)),('d',cast(NULL AS string)) AS e(Res_Number,admission_county)
), differences AS (
 (SELECT Res_Number,admission_county FROM actual EXCEPT ALL SELECT * FROM expected)
 UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT Res_Number,admission_county FROM actual)
)
SELECT count(*) AS failures FROM differences
""")
