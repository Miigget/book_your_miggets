#!/usr/bin/env bash
# afterFileEdit → tsc --noEmit, but only fail when the edited file has errors (M3L3).
# Full-project tsc currently reports pre-existing errors elsewhere; blocking those
# on every edit would freeze the agent. Lesson fallback: slow/noisy typecheck
# should not tank per-edit. Exit 2 only for errors in this file.
set -u

payload=$(cat)
file_path=$(printf '%s' "$payload" | jq -r '.file_path // empty' 2>/dev/null || true)

if [[ -z "$file_path" || ! -f "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  *.ts | *.tsx | *.astro) ;;
  *) exit 0 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root" || exit 0

rel=${file_path#"$root/"}
case "$rel" in
  src/types/database.ts | node_modules/* | .astro/* | dist/*) exit 0 ;;
esac

status=0
out=$(npx tsc --noEmit --pretty false 2>&1) || status=$?

if [[ "$status" -eq 0 ]]; then
  exit 0
fi

# tsc prints "path(line,col): error TSxxxx: ..."
file_errors=$(printf '%s\n' "$out" | grep -F "$rel" || true)

if [[ -n "$file_errors" ]]; then
  printf '%s\n' "$file_errors" >&2
  printf 'tsc reported errors in %s. Fix types in this file.\n' "$rel" >&2
  exit 2
fi

# Other files are red; do not block this edit (fail-open for unrelated errors).
exit 0
