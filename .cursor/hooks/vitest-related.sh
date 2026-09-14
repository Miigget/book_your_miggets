#!/usr/bin/env bash
# Optional M3L3: vitest related — only on the Risk #1 / lifecycle hot path.
# Cursor stdin: { "file_path": "<absolute>", "edits": [...] }
# Exit 2 = tests failed; agent should see the output.
set -u

payload=$(cat)
file_path=$(printf '%s' "$payload" | jq -r '.file_path // empty' 2>/dev/null || true)

if [[ -z "$file_path" || ! -f "$file_path" ]]; then
  exit 0
fi

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root" || exit 0

rel=${file_path#"$root/"}

case "$rel" in
  src/lib/run-lifecycle.ts | src/lib/run-lifecycle.test.ts | src/lib/run-limits.ts | src/lib/run-limits.test.ts) ;;
  *) exit 0 ;;
esac

export AI_AGENT=1
status=0
out=$(npx vitest related "$rel" --run 2>&1) || status=$?

if [[ "$status" -ne 0 ]]; then
  printf '%s\n' "$out" >&2
  printf 'vitest related failed for %s (exit %s).\n' "$rel" "$status" >&2
  exit 2
fi

exit 0
