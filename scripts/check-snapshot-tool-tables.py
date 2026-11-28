"""Execute the actual publisher function without Spark, Azure or clinical data."""
import ast
import gzip
import hashlib
import json
from pathlib import Path

source = Path('databricks/notebooks/snapshot_publish.py').read_text()
tree = ast.parse(source)
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'publish_tool_table_shards')
namespace = dict(json=json, gzip=gzip, hashlib=hashlib, ContentSettings=lambda **kwargs: kwargs)
exec(compile(ast.Module(body=[function], type_ignores=[]), '<publisher>', 'exec'), namespace)

class Container:
    def __init__(self): self.blobs = {}
    def upload_blob(self, **kwargs): self.blobs[kwargs['name']] = kwargs['data']

rows = [{'record': index, 'text': 'Synthetic preservation test. ' * 500} for index in range(180)]
payload = {'reportsSummary': {'toolContext': {'tables': {'notes_summary': rows, 'resident_profile': [{'age': 40}]}}}}
container = Container()
refs = namespace['publish_tool_table_shards'](payload, container)
assert list(refs) == ['notes_summary']
ref = refs['notes_summary']
raw = gzip.decompress(container.blobs[ref['path']])
assert json.loads(raw) == rows and len(raw) == ref['bytes']
assert hashlib.sha256(raw).hexdigest() == ref['sha256']
assert ref['rows'] == len(rows) and len(container.blobs[ref['path']]) == ref['compressedBytes']
assert payload['reportsSummary']['toolContext']['tables'] == {'resident_profile': [{'age': 40}]}
assert source.index('payload_audit = validate_snapshot_payload') < source.index('table_references = publish_tool_table_shards') < source.index('upload_json(container_client, latest_blob, payload_json)')
oversized = {'reportsSummary': {'toolContext': {'tables': {f'table_{i}': rows for i in range(30)}}}}
try:
    namespace['publish_tool_table_shards'](oversized, Container())
    raise AssertionError('Combined hydration must remain bounded even when each table is small')
except ValueError as error:
    assert 'memory budget' in str(error)
print('Snapshot table publication passed: every row preserved, stable content hash, complete validation before pointer publication.')
