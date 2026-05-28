#!/usr/bin/env python3
"""
Duplicate file-content scanner for workspace hygiene checks.

Scans repository files (excluding heavy/generated folders), hashes contents,
and reports groups of files with identical content.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from collections import defaultdict
from pathlib import Path


SKIP_DIRS = {".git", ".next", "node_modules", "coverage", ".cursor"}


def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def collect_duplicate_groups(root: Path) -> list[list[Path]]:
    hash_map: dict[str, list[Path]] = defaultdict(list)

    for dirpath, dirnames, filenames in os.walk(root):
        current_dir = Path(dirpath)
        if should_skip(current_dir):
            dirnames[:] = []
            continue

        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in filenames:
            file_path = current_dir / filename

            if should_skip(file_path):
                continue

            try:
                data = file_path.read_bytes()
            except OSError:
                continue

            file_hash = hashlib.sha256(data).hexdigest()
            hash_map[file_hash].append(file_path)

    return [paths for paths in hash_map.values() if len(paths) > 1]


def normalize_groups(groups: list[list[Path]], root: Path) -> set[tuple[str, ...]]:
    normalized: set[tuple[str, ...]] = set()
    for group in groups:
        rel_group = sorted(str(path.resolve().relative_to(root)) for path in group)
        normalized.add(tuple(rel_group))
    return normalized


def load_baseline_groups(root: Path, baseline_file: Path) -> set[tuple[str, ...]]:
    groups: list[list[str]] = []
    current_group: list[str] = []

    for raw_line in baseline_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            if current_group:
                groups.append(sorted(current_group))
                current_group = []
            continue
        current_group.append(line)

    if current_group:
        groups.append(sorted(current_group))

    normalized: set[tuple[str, ...]] = set()
    for group in groups:
        tuple_group = tuple(group)
        for rel_path in tuple_group:
            # Ensure baseline paths are rooted in the scan directory.
            _ = (root / rel_path).resolve()
        normalized.add(tuple_group)
    return normalized


def write_baseline_groups(root: Path, baseline_file: Path, groups: set[tuple[str, ...]]) -> None:
    header_lines = [
        "# Duplicate file-content baseline (relative to repository root).",
        "# Keep each duplicate group contiguous and separated by a blank line.",
        "",
    ]

    sorted_groups = sorted(groups)
    body_lines: list[str] = []
    for group in sorted_groups:
        body_lines.extend(group)
        body_lines.append("")

    content = "\n".join(header_lines + body_lines).rstrip() + "\n"
    baseline_file.parent.mkdir(parents=True, exist_ok=True)
    baseline_file.write_text(content, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan repository for duplicate file contents.")
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Root path to scan (defaults to current directory).",
    )
    parser.add_argument(
        "--max-groups",
        type=int,
        default=None,
        help="Fail with exit code 1 when duplicate group count exceeds this threshold.",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=None,
        help="Optional baseline file with expected duplicate groups (relative paths).",
    )
    parser.add_argument(
        "--write-baseline",
        type=Path,
        default=None,
        help="Write current duplicate groups to the given baseline file.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    duplicate_groups = collect_duplicate_groups(root)
    normalized_groups = normalize_groups(duplicate_groups, root)

    print(f"DUPLICATE_GROUPS={len(duplicate_groups)}")
    for group in duplicate_groups:
        print("---")
        for path in group:
            print(path)

    if args.max_groups is not None and len(duplicate_groups) > args.max_groups:
        print(
            f"ERROR: duplicate groups ({len(duplicate_groups)}) exceed allowed max ({args.max_groups}).",
            file=sys.stderr,
        )
        return 1

    if args.baseline is not None:
        baseline_path = args.baseline if args.baseline.is_absolute() else (root / args.baseline)
        if not baseline_path.exists():
            print(f"ERROR: baseline file not found: {baseline_path}", file=sys.stderr)
            return 1

        expected_groups = load_baseline_groups(root, baseline_path)
        unexpected = normalized_groups - expected_groups
        missing = expected_groups - normalized_groups

        if unexpected:
            print("ERROR: unexpected duplicate groups detected:", file=sys.stderr)
            for group in sorted(unexpected):
                print(f"  + {group}", file=sys.stderr)

        if missing:
            print("ERROR: expected duplicate groups missing (baseline drift):", file=sys.stderr)
            for group in sorted(missing):
                print(f"  - {group}", file=sys.stderr)

        if unexpected or missing:
            return 1

    if args.write_baseline is not None:
        output_path = args.write_baseline if args.write_baseline.is_absolute() else (root / args.write_baseline)
        write_baseline_groups(root, output_path, normalized_groups)
        print(f"BASELINE_WRITTEN={output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
