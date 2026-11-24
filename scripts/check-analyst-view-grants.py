"""Execute the actual publisher helper with a synthetic Spark boundary."""
import ast
from pathlib import Path

source = Path("databricks/notebooks/tool_context_views.py").read_text()
tree = ast.parse(source)
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in {"create_view", "rebind_existing_view"}]

class Spark:
    def __init__(self):
        self.calls = []
    def sql(self, statement):
        self.calls.append(statement.strip())
        return self
    def first(self):
        return {"view_definition": "SELECT 1 AS existing;"}

spark = Spark()
namespace = {"spark": spark, "target": "fixture.gold", "catalog": "fixture", "gold_schema": "gold", "qualified_table_exists": lambda _: True}
exec(compile(ast.Module(body=functions, type_ignores=[]), "publisher-functions", "exec"), namespace)
namespace["create_view"]("v_tool_example", "SELECT 1 AS value")
assert spark.calls == ["ALTER VIEW fixture.gold.v_tool_example AS SELECT 1 AS value"]
spark.calls.clear()
namespace["create_view"]("v_tool_example", "SELECT 2 AS value", schema_evolution=True)
assert spark.calls == ["ALTER VIEW fixture.gold.v_tool_example AS SELECT 2 AS value", "ALTER VIEW fixture.gold.v_tool_example WITH SCHEMA EVOLUTION"]
spark.calls.clear()
namespace["qualified_table_exists"] = lambda _: False
namespace["create_view"]("v_tool_new", "SELECT 1 AS value")
assert spark.calls == ["CREATE VIEW fixture.gold.v_tool_new AS SELECT 1 AS value"]
spark.calls.clear()
namespace["rebind_existing_view"]("v_existing")
assert spark.calls[-1] == "ALTER VIEW fixture.gold.`v_existing` AS SELECT 1 AS existing"
assert not any("CREATE OR REPLACE" in call for call in spark.calls)
print("Analyst view creation, daily grant-preserving refresh, schema evolution and rebinding passed.")
