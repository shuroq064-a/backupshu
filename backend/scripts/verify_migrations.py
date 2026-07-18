#!/usr/bin/env python3
"""Validate the Alembic migration graph without connecting to the database."""

from __future__ import annotations

import sys
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


BACKEND_DIR = Path(__file__).resolve().parents[1]
EXPECTED_HEADS_FILE = BACKEND_DIR / "alembic" / "expected_heads.txt"


def expected_heads() -> set[str]:
    if not EXPECTED_HEADS_FILE.is_file():
        raise RuntimeError(f"Missing migration manifest: {EXPECTED_HEADS_FILE}")

    heads = {
        line.strip()
        for line in EXPECTED_HEADS_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    if not heads:
        raise RuntimeError("Migration manifest does not declare a head revision")
    return heads


def main() -> int:
    try:
        config = Config(str(BACKEND_DIR / "alembic.ini"))
        script = ScriptDirectory.from_config(config)

        # Loading the revision map and walking it catches dangling
        # down_revision/depends_on values and duplicate revision IDs.
        list(script.walk_revisions())
        actual_heads = set(script.get_heads())
        declared_heads = expected_heads()
    except Exception as exc:
        print(f"Alembic migration validation failed: {exc}", file=sys.stderr)
        return 1

    if actual_heads != declared_heads:
        print(
            "Alembic migration validation failed: expected heads "
            f"{sorted(declared_heads)}, found {sorted(actual_heads)}. "
            "Commit the missing migration file and update alembic/expected_heads.txt.",
            file=sys.stderr,
        )
        return 1

    print(f"Alembic migration graph is valid (head: {', '.join(sorted(actual_heads))}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
