#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/generate.sh
#   ./scripts/generate.sh 30

COUNT="${1:-10}"
MAX_FIX_ATTEMPTS="${MAX_FIX_ATTEMPTS:-3}"

if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  echo "error: COUNT must be a non-negative integer" >&2
  echo "usage: ./scripts/generate.sh [count]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm is required but not found in PATH" >&2
  exit 1
fi

CURRENT_CHILD_PID=""

on_interrupt() {
  echo ""
  echo "Interrupted. Stopping current task..."
  if [ -n "$CURRENT_CHILD_PID" ] && kill -0 "$CURRENT_CHILD_PID" 2>/dev/null; then
    kill -INT "$CURRENT_CHILD_PID" 2>/dev/null || true
    wait "$CURRENT_CHILD_PID" 2>/dev/null || true
  fi
  exit 130
}

trap on_interrupt INT TERM

run_and_wait() {
  "$@" &
  CURRENT_CHILD_PID=$!
  set +e
  wait "$CURRENT_CHILD_PID"
  local rc=$?
  set -e
  CURRENT_CHILD_PID=""
  return "$rc"
}

run_typecheck() {
  run_and_wait pnpm exec tsc -b tsconfig.json --pretty false
}

run_build() {
  run_and_wait pnpm build
}

install_deps() {
  echo "Installing dependencies with pnpm..."
  run_and_wait pnpm install --prefer-frozen-lockfile
}

read -r -d '' FIX_PROMPT <<'EOF' || true
The repository currently fails TypeScript build mode typechecking.

Your job:
1. Run `pnpm exec tsc -b tsconfig.json --pretty false` in the repo root.
2. Fix TypeScript and project-reference issues until that command passes.
3. Keep `.gitignore` safe: do not commit `dist/`, `node_modules/`, or generated JS outputs.
4. Make only targeted fixes; keep architecture and package boundaries coherent.
5. If fixes add/change dependencies, update the correct package.json files and run `pnpm install --prefer-frozen-lockfile`.
6. Keep all edited package.json files valid JSON.
7. Do not leave unresolved imports: only use internal aliases that exist in tsconfig path mappings and project references.
8. After fixes, rerun `pnpm exec tsc -b tsconfig.json --pretty false` and `pnpm build`, and report success only if both pass.
EOF

read -r -d '' PROMPT <<'EOF' || true
Continue improving this synthetic TypeScript monorepo to stress tsz.

Hard constraints:
1. Keep code hand-authored quality and realistic module boundaries.
2. Grow project-reference hierarchy depth and inter-package dependencies.
3. Keep .gitignore safe: never commit dist/, node_modules/, generated JS outputs.
4. Prefer real dependencies (e.g. zod, AWS SDK packages where appropriate), avoid fake local stubs pretending to be external libs.
5. Maintain/expand composite project references in root tsconfig.json and package-level tsconfig references.
6. Add substantial new TypeScript source (.ts) with meaningful domain models, generic utility types, orchestration code, adapters, and realistic service layers.
7. Keep imports/path aliases coherent; do not break existing workspace structure.
8. Every changed or new TypeScript file must be syntactically valid and compatible with current tsconfig settings (no placeholders, no pseudocode, no TODO-only stubs).
9. Do not introduce unresolved imports. Only import workspace aliases that already exist in tsconfig path mappings and are backed by referenced packages.
10. When introducing external imports, add them to the correct package.json dependency section and ensure install succeeds with `pnpm install --prefer-frozen-lockfile`.
11. Keep every changed package.json file valid JSON (no trailing commas/comments).
12. Before finishing, run `pnpm exec tsc -b tsconfig.json --pretty false` and `pnpm build`; if either fails, fix errors and rerun until both are clean.
13. Add at least 500 net-new lines of TypeScript per iteration across at least 5 new or expanded `.ts` files.
14. Re-run scripts/count.sh and report TOTAL_TS_LINES and TOTAL_TS_FILES in your final response.
15. Make a clean git commit for this iteration with a clear message.
16. Do not use apply_patch via exec_command.

Execution target:
- Increase total TypeScript LOC significantly each iteration (minimum 500 net-new TS LOC).
- Preserve repository usability and consistency for tsz stress testing.
EOF

ensure_typecheck_clean() {
  local attempt=1
  while [ "$attempt" -le "$MAX_FIX_ATTEMPTS" ]; do
    echo "Typecheck attempt $attempt/$MAX_FIX_ATTEMPTS"
    install_deps
    if run_typecheck; then
      echo "Typecheck is clean."
      return 0
    fi

    echo "Typecheck failed. Running Codex fix pass..."
    run_and_wait codex exec \
      --model=gpt-5.3-codex-spark \
      --dangerously-bypass-approvals-and-sandbox \
      --config model_reasoning_effort=low \
      "$FIX_PROMPT"

    attempt=$((attempt + 1))
  done

  echo "error: typecheck still failing after $MAX_FIX_ATTEMPTS fix attempt(s)." >&2
  return 1
}

ensure_build_clean() {
  local attempt=1
  while [ "$attempt" -le "$MAX_FIX_ATTEMPTS" ]; do
    echo "Build attempt $attempt/$MAX_FIX_ATTEMPTS"
    install_deps
    if run_build; then
      echo "Build is clean."
      return 0
    fi

    echo "Build failed. Running Codex fix pass..."
    run_and_wait codex exec \
      --model=gpt-5.3-codex-spark \
      --dangerously-bypass-approvals-and-sandbox \
      --config model_reasoning_effort=low \
      "$FIX_PROMPT"

    attempt=$((attempt + 1))
  done

  echo "error: build still failing after $MAX_FIX_ATTEMPTS fix attempt(s)." >&2
  return 1
}

ensure_repo_clean() {
  ensure_typecheck_clean
  ensure_build_clean
}

echo "Running generation loop from 0 to $COUNT at: $ROOT"
install_deps

for i in $(seq 0 "$COUNT"); do
  echo ""
  echo "=== Iteration $i (0..$COUNT) ==="
  ensure_repo_clean
  run_and_wait codex exec \
    --model=gpt-5.3-codex-spark \
    --dangerously-bypass-approvals-and-sandbox \
    --config model_reasoning_effort=low \
    "$PROMPT"
  install_deps
  echo "Verifying full typecheck + build after iteration $i..."
  ensure_repo_clean
  echo "Iteration $i complete: full typecheck + build are clean."
done

echo ""
echo "All iterations complete."
