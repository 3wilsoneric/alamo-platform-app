# NVIDIA Auto Ontology interchange

This directory vendors the unmodified `AutoOntologyModelDocument` definitions
from NVIDIA Auto Ontology at the commit in `manifest.json`, with its Apache-2.0
license. `model.schema.json` is generated from those actual Pydantic definitions;
ProForma uses that schema with Ajv before projecting metadata into its graph.

This is a bounded adoption of the native interchange contract. It does not install
NVIDIA's application, authentication, database connectors, embeddings, MCP server,
SQL generator or query execution. No NVIDIA endpoint receives our data.

Reproduce or verify with Python 3.12 and `pydantic==2.13.5` in an isolated venv:

```sh
python scripts/check-ontology-upstream.py
python scripts/check-ontology-upstream.py /path/to/export.json
```

`--write` regenerates only the JSON schema. Changing the upstream revision requires
reviewing the new model, replacing the pinned source/license, regenerating the
schema, refreshing the manifest hashes and running the ontology and graph checks.
Do not edit `schemas.py` or the generated schema to conceal compatibility failures.
The manifest is a reproducibility receipt, not an upstream signature.
