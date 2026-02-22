# Large TypeScript Monorepo

This is a large AI-generated TypeScript monorepo that contains multiple packages and projects. 

## Why?

Most very large open source TypeScript monorepos have very custom build systems (e.g. VSCode, Next.js). This monorepo is designed to be a public resource for testing TypeScript compilers and tools on large codebases. Personally I am using this for [`tsz`](https://tsz.dev) which is a TypeScript compiler written in Rust.

## Purpose

This is entirely AI generated using `Codex-5.3-Spark` for testing purposes. The monorepo is designed to stress test TypeScript compilers

## How it was generated

See [`generate.sh`](./scripts/generate.sh) for the script that was used to generate this monorepo. 

## Project Graph

See [`GRAPH.md`](./GRAPH.md) for the TypeScript project-reference graph generated from `tsconfig.json` by [`scripts/graph.sh`](./scripts/graph.sh).

## Lines of Code

<!-- LOC:START -->

| Metric | Value |
| :-- | --: |
| TypeScript files | **1,358** |
| Code lines | **241,912** |
| Blank lines | 27,971 |
| Comment lines | 3 |
| Last updated | `2026-02-22 21:24:02` |

<!-- LOC:END -->
