#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/GRAPH.md"

ROOT="$ROOT" OUT="$OUT" node <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import archy from 'archy';

const root = process.env.ROOT;
const out = process.env.OUT;
if (!root || !out) {
  throw new Error('ROOT and OUT environment variables are required.');
}

const rootTsconfig = path.join(root, 'tsconfig.json');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const maybeReadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
};

const toPosixRel = (filePath) => path.relative(root, filePath).split(path.sep).join('/');

const resolveReference = (fromTsconfig, referencePath) => {
  const fromDir = path.dirname(fromTsconfig);
  const raw = path.resolve(fromDir, referencePath);
  const candidates = [];

  if (raw.endsWith('.json')) {
    candidates.push(raw);
  } else {
    candidates.push(path.join(raw, 'tsconfig.json'));
    candidates.push(`${raw}.json`);
    candidates.push(raw);
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return fs.realpathSync(candidate);
    }
  }
  return null;
};

const nodeLabel = (tsconfigPath) => {
  if (tsconfigPath === fs.realpathSync(rootTsconfig)) return 'root tsconfig.json';
  const dir = path.dirname(tsconfigPath);
  const relDir = toPosixRel(dir);
  if (relDir.startsWith('packages/')) return relDir.slice('packages/'.length);
  return toPosixRel(tsconfigPath);
};

const graph = new Map();
const unresolved = [];
const queue = [fs.realpathSync(rootTsconfig)];
const seen = new Set();

while (queue.length > 0) {
  const current = queue.shift();
  if (!current || seen.has(current)) continue;
  seen.add(current);

  const tsconfig = readJson(current);
  const refs = Array.isArray(tsconfig.references) ? tsconfig.references : [];
  const edges = new Set();

  for (const ref of refs) {
    const refPath = typeof ref === 'string' ? ref : ref?.path;
    if (typeof refPath !== 'string') continue;
    const resolved = resolveReference(current, refPath);
    if (!resolved) {
      unresolved.push(`${toPosixRel(current)} -> ${refPath}`);
      continue;
    }
    edges.add(resolved);
    if (!seen.has(resolved)) queue.push(resolved);
  }

  graph.set(current, edges);
}

const sortedChildren = (id) =>
  [...(graph.get(id) ?? [])].sort((a, b) => nodeLabel(a).localeCompare(nodeLabel(b)));

const expanded = new Set();
const buildTreeNode = (id, pathSet) => {
  const label = nodeLabel(id);
  const children = sortedChildren(id);
  const nextPath = new Set(pathSet);
  nextPath.add(id);

  const nodes = children.flatMap((child) => {
    if (pathSet.has(child)) {
      return [{ label: `${nodeLabel(child)} (cycle)`, nodes: [] }];
    }
    if (expanded.has(child)) {
      return [];
    }
    expanded.add(child);
    return [buildTreeNode(child, nextPath)];
  });

  return { label, nodes };
};

const rootId = fs.realpathSync(rootTsconfig);
expanded.add(rootId);
const tree = buildTreeNode(rootId, new Set());

const allEdges = [];
for (const [from, tos] of graph.entries()) {
  const fromLabel = nodeLabel(from);
  for (const to of tos) {
    allEdges.push(`${fromLabel} -> ${nodeLabel(to)}`);
  }
}
allEdges.sort((a, b) => a.localeCompare(b));

const now = new Date().toISOString();
const lines = [];
lines.push('# Project Graph');
lines.push('');
lines.push(`Generated from TypeScript project references in \`tsconfig.json\` on \`${now}\`.`);
lines.push('');
lines.push(`- Projects: **${graph.size}**`);
lines.push('');
lines.push('## Reference Tree');
lines.push('');
lines.push('```text');
lines.push(archy(tree, '', { unicode: true }).trimEnd());
lines.push('```');

if (unresolved.length > 0) {
  unresolved.sort((a, b) => a.localeCompare(b));
  lines.push('');
  lines.push('## Unresolved References');
  lines.push('');
  lines.push('```text');
  for (const miss of unresolved) lines.push(miss);
  lines.push('```');
}

fs.writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`Wrote ${toPosixRel(out)} with ${graph.size} projects and ${allEdges.length} edges.`);
NODE
