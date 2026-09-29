"""Restore a verified collector archive without allowing links or path traversal."""
import argparse
from pathlib import Path, PurePosixPath
import tarfile
import shutil


def restore(archive, destination):
    with tarfile.open(archive, "r:gz") as source:
        members = source.getmembers()
        if len(members) > 50000 or sum(item.size for item in members) > 256 * 1024 * 1024:
            raise ValueError("Collector archive is oversized")
        for item in members:
            name = PurePosixPath(item.name)
            if (name.is_absolute() or ".." in name.parts or not name.parts
                    or name.parts[0] != "data" or not (item.isfile() or item.isdir())):
                raise ValueError("Unsafe collector archive entry")
        if (destination / "data").exists():
            raise ValueError("Restore destination must be empty")
        for item in members:
            target = destination / item.name
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(item) as original, target.open("xb") as output:
                    shutil.copyfileobj(original, output)
    root = destination / "data"
    if not (root / "baseline.sqlite").is_file() or not (root / "latest-complete.txt").is_file():
        raise ValueError("Collector archive is incomplete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    restore(args.archive, args.destination)
