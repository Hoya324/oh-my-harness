---
name: omh-docs-sync
description: Update only the docs affected by a given list of changed code files — used by the opt-in pre-push hook (claude -p) or on request before a push
---

# /omh-docs-sync

Single purpose: keep docs true to the code that changed. Input is a list of changed files (from the pre-push hook or `git diff --name-only <base>...HEAD`).

1. For each changed file, find docs that describe it: grep `docs/`, `README.md`, and `README.ko.md` for its path, exported names, CLI commands, config keys, and hook names.
2. Read the code change (`git diff <base>...HEAD -- <file>`) and decide whether any found passage is now wrong or missing. Most changes need no doc change; then do nothing.
3. Edit only the passages that are wrong. Keep the document's structure and wording style. When a doc has a Korean twin (`*.ko.md`, `README.ko.md`), make the same change there.
4. Never edit code, tests, CHANGELOG, or generated files, and never create new docs.
5. Print one line per edited file: `<path>: <what changed>`. If nothing needed changing, print `no doc changes`.
