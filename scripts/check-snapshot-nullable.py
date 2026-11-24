"""Execute the actual publisher's resident projection with null/zero fixtures."""
import ast
from collections import defaultdict
from pathlib import Path

tree = ast.parse(Path("databricks/notebooks/snapshot_publish.py").read_text())
namespace = {}
namespace["expected_as_of_date"] = "2026-11-23"
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in {"normalize_str", "normalize_nullable", "normalize_int", "iso_value"}:
        exec(compile(ast.Module(body=[node], type_ignores=[]), "publisher", "exec"), namespace)
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "build_tool_context_summary")
projections = {node.targets[0].id: node for node in function.body if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)}
namespace["resident_profile_rows"] = [defaultdict(lambda: None, Age=value, LOS_Days=value, days_since_last_note=value) for value in [None, 0, 37]]
namespace["manifest_rows"] = [defaultdict(lambda: None, slice_name="resident_profile", fields="Age,LOS_Days,days_since_last_note")]
for key in ["resident_profiles", "manifest"]:
    exec(compile(ast.Module(body=[projections[key]], type_ignores=[]), "publisher", "exec"), namespace)
for key in ["age", "los_days", "days_since_last_note"]:
    assert [row[key] for row in namespace["resident_profiles"]] == [None, 0, 37], key
assert namespace["manifest"][0]["nullable_fields"] == ["Age", "LOS_Days", "days_since_last_note"]
assert namespace["manifest"][0]["as_of_date"] == "2026-11-23"
namespace["manifest_rows"][0]["fields"] = "Age,LOS_Days"
exec(compile(ast.Module(body=[projections["manifest"]], type_ignores=[]), "publisher", "exec"), namespace)
assert namespace["manifest"][0]["nullable_fields"] == ["Age", "LOS_Days"]
print("Actual snapshot projection preserves missing, zero and known resident measures.")
