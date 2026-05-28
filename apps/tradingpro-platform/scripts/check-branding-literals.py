#!/usr/bin/env python3
"""
Branding literal guard.

Fails when legacy brand literals are found outside Branding/ so rebrands stay centralized.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


FORBIDDEN_LITERALS = [
    "MarketPulse360",
    "marketpulse360.live",
    "support@marketpulse360.live",
    "support@marketpulse360.com",
    "onboarding@marketpulse360.live",
]

ROUTE_LITERAL_BASES = [
    "/why-marketpulse",
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/password-reset",
    "/auth/email-verification",
    "/auth/otp-verification",
    "/auth/mpin-setup",
    "/auth/mpin-verify",
    "/auth/phone-verification",
    "/auth/kyc",
    "/dashboard",
    "/admin-console",
    "/products/cfd-instrument",
    "/products/indexes",
    "/products/stocks",
    "/products/commodity",
    "/payment-method/bank-transfer",
    "/payment-method/upi-transfer",
    "/payment-method/cash-payment",
    "/payment-method/crypto-usdt-trc20",
]

FORBIDDEN_ROUTE_LITERALS = sorted({
    token
    for route in ROUTE_LITERAL_BASES
    for token in (
        f'"{route}"',
        f"'{route}'",
        f"`{route}`",
        f'"{route}',
        f"'{route}",
        f"`{route}",
    )
})

SCAN_ROOTS = [
    "app",
    "components",
    "lib",
    "actions",
    "scripts",
    "prisma",
    "middleware.ts",
    "next.config.mjs",
    "tailwind.config.ts",
]

SCAN_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".py"}

SKIP_DIRS = {
    ".git",
    ".next",
    ".cursor",
    "node_modules",
    "coverage",
    "docs",
    "public",
    "tests",
    "dist",
    "build",
    "generated",
    "migrations",
}

ALLOWLIST_FILE_SUFFIXES = {
    "components/test.tsx",
    "scripts/check-branding-literals.py",
    "lib/branding-routes.ts",
}


def should_skip(path: Path, repo_root: Path) -> bool:
    relative = path.relative_to(repo_root)
    relative_str = relative.as_posix()

    if any(part in SKIP_DIRS for part in relative.parts):
        return True
    if "Branding/" in relative_str or relative_str.startswith("Branding/"):
        return True
    if relative_str in ALLOWLIST_FILE_SUFFIXES:
        return True
    if path.suffix and path.suffix not in SCAN_EXTENSIONS:
        return True

    return False


def iter_target_files(repo_root: Path):
    for root_entry in SCAN_ROOTS:
        target = repo_root / root_entry
        if not target.exists():
            continue
        if target.is_file():
            if not should_skip(target, repo_root):
                yield target
            continue
        for file_path in target.rglob("*"):
            if not file_path.is_file():
                continue
            if should_skip(file_path, repo_root):
                continue
            yield file_path


def collect_hits(file_path: Path, literals: list[str]) -> list[tuple[int, str, str]]:
    try:
        text = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = file_path.read_text(encoding="utf-8", errors="ignore")

    hits: list[tuple[int, str, str]] = []
    for idx, line in enumerate(text.splitlines(), start=1):
        for literal in literals:
            if literal in line:
                hits.append((idx, literal, line.strip()))
    return hits


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check legacy branding and route literals outside Branding/ and route helpers."
    )
    parser.add_argument("repo_root", nargs="?", default=".", help="Repository root path")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    if not repo_root.exists():
        print(f"Repository root not found: {repo_root}")
        return 2

    violations: dict[Path, list[tuple[int, str, str]]] = {}
    forbidden_tokens = [*FORBIDDEN_LITERALS, *FORBIDDEN_ROUTE_LITERALS]
    for file_path in iter_target_files(repo_root):
        hits = collect_hits(file_path, forbidden_tokens)
        if hits:
            violations[file_path] = hits

    if not violations:
        print("Branding literal guard passed: no legacy branding or route literals found outside allowed modules.")
        return 0

    print("Branding literal guard failed. Found legacy branding/route literals outside allowed modules:")
    for file_path, hits in sorted(violations.items(), key=lambda item: item[0].as_posix()):
        rel = file_path.relative_to(repo_root).as_posix()
        print(f"- {rel}")
        for line_no, literal, line_text in hits[:8]:
            print(f"  L{line_no}: [{literal}] {line_text}")
        if len(hits) > 8:
            print(f"  ... and {len(hits) - 8} more match(es)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
