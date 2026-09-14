#!/usr/bin/env bash
# afterFileEdit → ESLint --fix on the edited file only (M3L3).
# Cursor stdin: { "file_path": "<absolute>", "edits": [...] }
# Exit 2 = blocking signal so the agent sees remaining lint errors.
set -u

payload=$(cat)
file_path=$(printf '%s' "$payload" | jq -r '.file_path // empty' 2>/dev/null || true)

if [[ -z "$file_path" || ! -f "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.astro) ;;
  *) exit 0 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root" || exit 0

rel=${file_path#"$root/"}
case "$rel" in
  src/types/database.ts | scripts/* | node_modules/* | .astro/* | dist/*) exit 0 ;;
esac

status=0
out=$(npx eslint --fix --quiet "$file_path" 2>&1) || status=$?

if [[ "$status" -ne 0 ]]; then
  printf '%s\n' "$out" >&2
  printf 'eslint failed on %s (exit %s). Fix the remaining lint errors.\n' "$rel" "$status" >&2
  exit 2
fi

exit 0
