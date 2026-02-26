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
Continue improving this synthetic TypeScript monorepo to stress the TypeScript compiler (tsc) with patterns that maximize checker, solver, and binder workload.

Execution style:
- Write code directly. Do not provide plans, long explanations, or analysis in the final response.
- Optimize for speed and volume while preserving correctness.

=== COMPILER-STRESSING PATTERNS (PRIORITY) ===

Generate code that specifically targets these heavy compiler workloads, drawn from real tsz/tsgo benchmark categories:

A. Conditional types with large union discrimination (20-50+ union members):
   - Deeply nested `extends ? : ` chains that force the checker to evaluate many branches.
   - Distributive conditional types over large unions (e.g. `type Resolve<T> = T extends SomeUnion ? ... : ...`).
   - Chained conditional type resolution where the output of one feeds the input of another.

B. Deep subtype hierarchies (depth 30-90):
   - Interfaces extending interfaces in long chains (A extends B extends C extends ... up to 30+ deep).
   - Class hierarchies with generic parameters that vary at each level.
   - Structural compatibility checks forcing the checker to walk deep prototype chains.

C. Intersection types at scale (15-45 members):
   - Types that are intersections of many object types: `A & B & C & D & ... & Z`.
   - Generic functions that return intersections built from mapped input types.
   - Intersection collapse scenarios where the compiler must flatten and reconcile overlapping keys.

D. Mapped types with complex template keys:
   - `{ [K in keyof T as TemplateExpression<K>]: TransformedValue<T[K]> }` patterns.
   - Key remapping with `as` clauses that involve template literal transformations.
   - Nested mapped types (mapped type within a mapped type).
   - Homomorphic mapped types over generic parameters that preserve modifiers.

E. Recursive generics (depth 15-45):
   - Recursive type aliases: `type Deep<T, N extends number> = N extends 0 ? T : Deep<Wrap<T>, Decrement<N>>`.
   - Recursive tuple builders: `type BuildTuple<N, T extends unknown[] = []> = T['length'] extends N ? T : BuildTuple<N, [...T, unknown]>`.
   - Mutual recursion between two or more type aliases.
   - Recursive conditional types that accumulate results in tuple type parameters.

F. Template literal types with nested complexity:
   - Template literal types built from unions: `type Routes = \`/\${Entity}/\${Action}/\${Id}\``.
   - Pattern matching with template literal inference: `T extends \`\${infer A}-\${infer B}\` ? ...`.
   - Combinations of template literals with mapped types to generate API route types or event name types.

G. Control flow graph stress (50-150 branches):
   - Functions with many `if/else if/else` branches or large `switch` statements (30-50+ cases).
   - Type narrowing across many branches using discriminated unions.
   - Complex truthiness narrowing and type guard chains.
   - Nested control flow: loops inside conditionals inside try/catch, each with type narrowing.

H. Binary expression type stress:
   - Long chains of `&&` and `||` with different typed operands forcing progressive narrowing.
   - Arithmetic on numeric literal types using recursive tuple helpers.
   - String concatenation chains that produce template literal types.

I. Constraint conflict resolution:
   - Generic functions with multiple type parameters that have interdependent constraints.
   - `extends` clauses that reference other type parameters: `<A extends B, B extends C, C extends Record<string, A>>`.
   - Conditional types inside generic constraints creating circular-ish resolution paths.
   - Overloaded function signatures (5-10+ overloads) with complex generic constraints.

J. Generic function instantiation at scale:
   - Generic functions called with many different type argument combinations in the same file.
   - Higher-order generic functions: functions that accept and return other generic functions.
   - Generic class factories with many type parameters.
   - Inference from complex object literal arguments with many properties.

K. Solver stress patterns:
   - Variance annotations (`in`, `out`, `in out`) on generic type parameters with non-trivial checking.
   - `satisfies` expressions on complex object literals against mapped/conditional types.
   - `NoInfer<T>` in function signatures that force specific inference behavior.
   - Branded/nominal types with complex type guards and assertion functions.

L. Real-world utility type complexity:
   - Deep `Readonly<T>`, `Required<T>`, `Partial<T>` nesting and composition.
   - `Pick`/`Omit` chains across intersection types.
   - Discriminated union to lookup-map transformations and back.
   - Path-based deep property access types: `type DeepGet<T, P extends string> = ...`.

=== HARD CONSTRAINTS ===

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
13. `tsc -b` MUST pass: run `pnpm exec tsc -b tsconfig.json --pretty false` after every change. This is a hard gate — do NOT finish or claim success unless it exits with code 0. Also run `pnpm build` and ensure it passes. If either fails, fix all errors and rerun both until clean.
14. In every iteration, add React code too: at least 200 net-new lines of `.tsx` across at least 3 files (components/hooks/pages), with typed props/state and valid imports.
15. When introducing or expanding React code, ensure required dependencies/types are present in the correct package.json files (e.g. react, react-dom, @types/react, @types/react-dom when needed).
16. Add at least 900 net-new lines of TypeScript total per iteration across at least 8 new or expanded `.ts`/`.tsx` files.
17. Prefer adding new `.ts/.tsx` modules over refactoring large existing files to maximize safe net-new LOC.
18. Re-run scripts/count.sh and report TOTAL_TS_LINES and TOTAL_TS_FILES in your final response.
19. Make a clean git commit for this iteration with a clear message, and always include `pnpm-lock.yaml` in the commit whenever it changed.
20. Do not use apply_patch via exec_command.

=== CACHE INVALIDATION STRATEGY ===

Structure the dependency graph to minimize the effectiveness of tsbuildinfo incremental caching:

1. Shared foundation packages: Create and expand shared/utility packages (e.g. `@shared/type-level`, `@shared/result`, `@shared/common-types`) that are imported by MANY downstream packages. Every iteration should touch or expand type exports in these widely-depended-on packages, forcing cache invalidation across the entire downstream graph.

2. Hub packages: Build packages that re-export types from many other packages, creating wide dependency fan-out. When a hub package changes, every consumer must be rechecked.

3. Deep reference chains: Grow the project-reference chain depth (A references B references C references D...). A change at the root of a deep chain invalidates every package along the chain.

4. Cross-cutting type definitions: Place core branded types, discriminated unions, and utility types in shared packages that are used pervasively. Evolve these types each iteration (add union members, extend interfaces, add new generic parameters with defaults) so downstream packages are forced to re-validate.

5. Type-level re-exports: Have mid-tier packages re-export and augment types from shared packages, then have leaf packages consume those augmented re-exports. This creates multi-hop invalidation paths.

6. Maximize fan-out from shared packages: Aim for shared utility packages to be referenced by 10+ other packages. Each iteration, add or modify at least one type export in a high-fan-out shared package to force widespread cache misses.

=== DISTRIBUTION GUIDANCE ===

Each iteration should include AT LEAST 4 of the patterns A-L above. Spread coverage across iterations so all patterns get exercised. Aim for:
- At least 1 file dedicated to pure type-level computation (conditional/mapped/recursive types).
- At least 1 file with deep class/interface hierarchies or intersection stress.
- At least 1 file with large control-flow graphs (switch/if chains with narrowing).
- At least 1 file with generic function instantiation at scale or overloaded signatures.
- Weave template literal types, branded types, and `satisfies` throughout all files naturally.
- EVERY iteration must touch at least one high-fan-out shared package to trigger broad cache invalidation.

Execution target:
- Increase total TypeScript LOC significantly each iteration (minimum 900 net-new TS LOC).
- Maximize type-checker workload per line of code — prefer patterns that are expensive to check over simple value-level code.
- Structure dependencies so that tsbuildinfo caching provides minimal benefit — maximize cache invalidation surface.
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
  if [ -f "$ROOT/pnpm-lock.yaml" ]; then
    git add "$ROOT/pnpm-lock.yaml"
  fi

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
  echo "Verifying strict compile gate (tsc -b + pnpm build) after iteration $i..."
  ensure_repo_clean
  commit_iteration "$i"
  echo "Post-commit tsc -b gate for iteration $i..."
  if ! run_typecheck; then
    echo "error: tsc -b failed after commit for iteration $i. Aborting." >&2
    exit 1
  fi
  echo "Iteration $i complete: tsc -b passes, no type errors remain."
done

echo ""
echo "All iterations complete."
