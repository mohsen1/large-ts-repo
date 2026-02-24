#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/generate.sh
#   ./scripts/generate.sh 30

COUNT="${1:-10}"
MAX_FIX_ATTEMPTS="${MAX_FIX_ATTEMPTS:-2}"

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

DEPS_SIGNATURE=""

manifest_signature() {
  local files=()
  [ -f "$ROOT/package.json" ] && files+=("$ROOT/package.json")
  [ -f "$ROOT/pnpm-lock.yaml" ] && files+=("$ROOT/pnpm-lock.yaml")
  [ -f "$ROOT/pnpm-workspace.yaml" ] && files+=("$ROOT/pnpm-workspace.yaml")

  while IFS= read -r file; do
    files+=("$file")
  done < <(find "$ROOT/packages" -type f -name package.json 2>/dev/null | sort)

  if [ "${#files[@]}" -eq 0 ]; then
    echo "no-manifest-files"
    return 0
  fi

  {
    for file in "${files[@]}"; do
      stat -f "%N:%m:%z" "$file"
    done
  } | shasum -a 256 | awk '{print $1}'
}

install_deps() {
  echo "Installing dependencies with pnpm..."
  run_and_wait pnpm install --frozen-lockfile=false
  DEPS_SIGNATURE="$(manifest_signature)"
}

install_deps_if_needed() {
  local current_signature
  current_signature="$(manifest_signature)"
  if [ ! -d "$ROOT/node_modules" ] || [ "$current_signature" != "$DEPS_SIGNATURE" ]; then
    install_deps
  else
    echo "Dependencies unchanged; skipping pnpm install."
  fi
}

read -r -d '' FIX_PROMPT <<'EOF' || true
The repository currently fails the monorepo build.

Your job:
1. Run `pnpm exec tsc -b tsconfig.json --pretty false` and `pnpm build` in the repo root.
2. Fix TypeScript/build/project-reference issues until both commands pass.
3. Keep `.gitignore` safe: do not commit `dist/`, `node_modules/`, or generated JS outputs.
4. Make only targeted fixes; keep architecture and package boundaries coherent.
5. If fixes add/change dependencies, update the correct package.json files and run `pnpm install --frozen-lockfile=false` to refresh `pnpm-lock.yaml`.
6. Keep all edited package.json files valid JSON.
7. Keep tsconfig files valid and parseable (fix JSON syntax/config syntax errors like missing commas immediately).
8. Do not leave unresolved imports: only use internal aliases that exist in tsconfig path mappings and project references.
9. Do not add scripts or generators; only edit normal source/config files needed for build stability.
10. After fixes, rerun both commands and report success only if both pass.
11. Prefer `using` declarations/resource cleanup patterns where appropriate and include modern JS/TS ergonomics in all generated code.
12. If either command reports diagnostics, continue fixing and re-run both commands immediately before any completion claim.
EOF

read -r -d '' PROMPT <<'EOF' || true
Continue improving this synthetic TypeScript monorepo to stress tsz with very modern and advanced TypeScript/JavaScript features.

Execution style:
- Write code directly. Do not provide plans, long explanations, or analysis in the final response.
- Optimize for speed and volume while preserving correctness.

Hard constraints:
1. Keep code hand-authored quality and realistic module boundaries.
2. Grow project-reference hierarchy depth and inter-package dependencies.
3. Keep .gitignore safe: never commit dist/, node_modules/, generated JS outputs.
4. Prefer real dependencies (e.g. zod, AWS SDK packages where appropriate), avoid fake local stubs pretending to be external libs.
5. Maintain/expand composite project references in root tsconfig.json and package-level tsconfig references.
6. Add substantial new TypeScript source (.ts/.tsx) with meaningful domain models, generic utility types, orchestration code, adapters, realistic service layers, and frontend UI modules.
6a. Use modern constructs extensively: `using` declarations and `Symbol.dispose`/`Symbol.asyncDispose` where relevant, `satisfies`, `infer`, recursive/variadic generics, template literal types, conditional/mapped types with key remapping, `NoInfer`, branded/nominal typing, recursive tuple helpers, and advanced utility composition.
6b. Include modern JavaScript idioms: top-level `await` where appropriate, iterator helpers, `AsyncDisposableStack`, and strongly typed plugin/registry patterns.
7. Keep imports/path aliases coherent; do not break existing workspace structure.
8. Every changed or new TypeScript file must be syntactically valid and compatible with current tsconfig settings (no placeholders, no pseudocode, no TODO-only stubs).
9. Do not introduce unresolved imports. Only import workspace aliases that already exist in tsconfig path mappings and are backed by referenced packages.
10. When introducing external imports, add them to the correct package.json dependency section and ensure install succeeds with `pnpm install --frozen-lockfile=false`.
11. Keep every changed package.json file valid JSON (no trailing commas/comments).
12. Do not add/modify code-generation scripts, shell scripts, node scripts, or one-off generators for this task.
13. Before finishing, run `pnpm exec tsc -b tsconfig.json --pretty false` and `pnpm build`; if either fails, fix errors and rerun until both are clean.
14. In every iteration, add React code too: at least 200 net-new lines of `.tsx` across at least 3 files (components/hooks/pages), with typed props/state and valid imports.
15. When introducing or expanding React code, ensure required dependencies/types are present in the correct package.json files (e.g. react, react-dom, @types/react, @types/react-dom when needed).
16. Add at least 900 net-new lines of TypeScript total per iteration across at least 8 new or expanded `.ts`/`.tsx` files.
17. Prefer adding new `.ts/.tsx` modules over refactoring large existing files to maximize safe net-new LOC.
18. Re-run scripts/count.sh and report TOTAL_TS_LINES and TOTAL_TS_FILES in your final response.
19. Make a clean git commit for this iteration with a clear message, and always include `pnpm-lock.yaml` in the commit whenever it changed.
20. Do not use apply_patch via exec_command.

Execution target:
- Increase total TypeScript LOC significantly each iteration (minimum 900 net-new TS LOC).
- Preserve repository usability and consistency for tsz stress testing.
EOF

ensure_build_clean() {
  local attempt=1
  while [ "$attempt" -le "$MAX_FIX_ATTEMPTS" ]; do
    echo "Build attempt $attempt/$MAX_FIX_ATTEMPTS"
    install_deps_if_needed
    if run_build; then
  echo "Build is clean."
  echo "Re-running typecheck after successful build..."
      if run_typecheck; then
        echo "Typecheck is clean."
        return 0
      fi
      echo "Typecheck failed after build success. Running Codex fix pass..."
      run_and_wait codex exec \
        --model=gpt-5.3-codex-spark \
        --dangerously-bypass-approvals-and-sandbox \
        --config model_reasoning_effort=medium \
        "$FIX_PROMPT"
      attempt=$((attempt + 1))
      continue

    fi

    echo "Build failed. Running Codex fix pass..."
    run_and_wait codex exec \
      --model=gpt-5.3-codex-spark \
      --dangerously-bypass-approvals-and-sandbox \
      --config model_reasoning_effort=medium \
      "$FIX_PROMPT"

    attempt=$((attempt + 1))
  done

  echo "error: build still failing after $MAX_FIX_ATTEMPTS fix attempt(s)." >&2
  return 1
}

ensure_typecheck_clean() {
  local attempt=1
  while [ "$attempt" -le "$MAX_FIX_ATTEMPTS" ]; do
    echo "Typecheck attempt $attempt/$MAX_FIX_ATTEMPTS"
    install_deps_if_needed
    if run_typecheck; then
      echo "Typecheck is clean."
      return 0
    fi

    echo "Typecheck failed. Running Codex fix pass..."
    run_and_wait codex exec \
      --model=gpt-5.3-codex-spark \
      --dangerously-bypass-approvals-and-sandbox \
      --config model_reasoning_effort=medium \
      "$FIX_PROMPT"

    attempt=$((attempt + 1))
  done

  echo "error: typecheck still failing after $MAX_FIX_ATTEMPTS fix attempt(s)." >&2
  return 1
}

commit_iteration() {
  local iteration="$1"
  git add -A

  if git diff --cached --quiet --ignore-submodules --; then
    echo "Iteration $iteration made no tracked file changes."
    return 0
  fi

  git commit --no-verify -m "chore(horizon): iteration ${iteration}"
}

ensure_repo_clean() {
  ensure_typecheck_clean
  ensure_build_clean
}

echo "Running generation loop from 0 to $COUNT at: $ROOT"
install_deps

echo "Pre-flight validation..."
ensure_repo_clean

for i in $(seq 0 "$COUNT"); do
  echo ""
  echo "=== Iteration $i (0..$COUNT) ==="
    run_and_wait codex exec \
      --model=gpt-5.3-codex-spark \
      --dangerously-bypass-approvals-and-sandbox \
      --config model_reasoning_effort=medium \
      "$PROMPT"
  install_deps_if_needed
  echo "Verifying strict compile gate (pnpm exec tsc -b tsconfig.json --pretty false + pnpm build) after iteration $i..."
  ensure_repo_clean
  commit_iteration "$i"
  echo "Iteration $i complete: all TypeScript checks are clean and no tsc errors remain."
done

echo ""
echo "All iterations complete."
