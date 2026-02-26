# Large TypeScript Monorepo

This is a large AI-generated TypeScript monorepo that contains multiple packages and projects. 

## Why?

Most very large open source TypeScript monorepos have custom build systems (e.g., VSCode, Next.js). This monorepo is designed to be a public resource for testing TypeScript compilers and tools on large codebases. Personally, I am using this for [`tsz`](https://tsz.dev), which is a TypeScript compiler written in Rust.


## How was it generated?

This is entirely AI-generated using `Codex-5.3-Spark` on a loop.

See [`generate.sh`](./scripts/generate.sh) for the script that was used to generate this monorepo. 

## Project Graph

See [`GRAPH.md`](./GRAPH.md) for the TypeScript project-reference graph generated from `tsconfig.json` by [`scripts/graph.sh`](./scripts/graph.sh).

## Lines of Code

<!-- LOC:START -->

| Metric | Value |
| :-- | --: |
| TypeScript files | **6,291** |
| Code lines | **755,937** |
| Blank lines | 86,597 |
| Comment lines | 41 |
| Last updated | `2026-02-26 13:47:36` |

<!-- LOC:END -->


## License
This monorepo is licensed under the MIT License. 
