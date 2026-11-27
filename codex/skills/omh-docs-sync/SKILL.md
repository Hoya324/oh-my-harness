---
name: omh-docs-sync
description: Use before a push, or from the opt-in pre-push hook, to update only the docs affected by a given list of changed code files.
---

# Sync docs with changed code

Single purpose: keep docs true to the code that changed. Input is a list of changed files (from the
pre-push hook or `git diff --name-only <base>...HEAD`).

1. For each changed file, search `docs/`, `README.md`, and `README.ko.md` for its path, exported
   names, CLI commands, config keys, and hook names.
2. Read the change (`git diff <base>...HEAD -- <file>`) and decide whether any passage found is now
   wrong or missing. Most changes need no doc change; then do nothing.
3. Edit only the wrong passages, keeping structure and wording style. Apply the same change to the
   Korean twin (`*.ko.md`, `README.ko.md`) when one exists.
4. Never edit code, tests, CHANGELOG, or generated files, and never create new docs.
5. Print one line per edited file, `<path>: <what changed>`, or `no doc changes`.
