#!/usr/bin/env node
/**
 * Generates TypeScript code with deep inter-package references.
 * Creates layered packages that chain through existing ones.
 *
 * Usage: node scripts/gen-deep.js [--batch N] [--lines-target N]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');

// Parse args
const args = process.argv.slice(2);
let BATCH = 0;
let LINES_TARGET = 250000; // new lines to generate
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--batch') BATCH = parseInt(args[++i], 10);
  if (args[i] === '--lines-target') LINES_TARGET = parseInt(args[++i], 10);
}

// Tier ordering for deep references
const TIER_ORDER = ['shared', 'domain', 'data', 'service', 'app'];

// --- Helpers ---

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Get existing packages per tier
function getExistingPackages() {
  const result = {};
  for (const tier of TIER_ORDER) {
    const tierDir = path.join(PACKAGES_DIR, tier);
    if (!fs.existsSync(tierDir)) continue;
    result[tier] = fs.readdirSync(tierDir).filter(d => {
      const p = path.join(tierDir, d);
      return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'tsconfig.json'));
    });
  }
  return result;
}

// Pick random items from array
function pick(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate a unique name
let nameCounter = BATCH * 1000;
function genName(prefix) {
  nameCounter++;
  const suffixes = ['core', 'engine', 'hub', 'bridge', 'nexus', 'mesh', 'fabric', 'lens', 'pulse', 'flow'];
  const domains = ['compute', 'data', 'signal', 'event', 'state', 'graph', 'stream', 'cache', 'index', 'queue',
    'metric', 'trace', 'span', 'node', 'edge', 'route', 'policy', 'rule', 'schema', 'model'];
  return `${prefix}-${pickOne(domains)}-${pickOne(suffixes)}-g${nameCounter}`;
}

// --- Code Generators ---

// Generate deep conditional types
function genConditionalTypes(exportPrefix, depth) {
  let code = '';
  // Large union
  const members = [];
  for (let i = 0; i < 30; i++) {
    members.push(`  | { readonly kind: '${exportPrefix}_v${i}'; readonly payload: string; readonly seq: number; readonly idx: ${i} }`);
  }
  code += `export type ${exportPrefix}Union =\n${members.join('\n')};\n\n`;

  // Conditional type chain - properly constrained
  for (let d = 0; d < Math.min(depth, 8); d++) {
    code += `export type ${exportPrefix}Resolve${d}<T extends ${exportPrefix}Union> = T extends { readonly kind: '${exportPrefix}_v${d}' }\n`;
    code += `  ? T['payload']\n`;
    code += `  : T extends { readonly idx: ${d} }\n`;
    code += `    ? \`resolved_${d}_\${T['seq']}\`\n`;
    code += `    : unknown;\n\n`;
  }

  // Chained resolution
  code += `export type ${exportPrefix}DeepResolve<T extends ${exportPrefix}Union> =\n`;
  for (let d = 0; d < Math.min(depth, 8); d++) {
    code += `  ${exportPrefix}Resolve${d}<T> extends infer R${d}\n  ? `;
  }
  code += `[${Array.from({ length: Math.min(depth, 8) }, (_, i) => `R${i}`).join(', ')}]\n`;
  for (let d = 0; d < Math.min(depth, 8); d++) {
    code += `  : never\n`;
  }
  code += `;\n\n`;

  // Distributive conditional
  code += `export type ${exportPrefix}Distribute<T extends ${exportPrefix}Union> = T extends infer U extends ${exportPrefix}Union\n`;
  code += `  ? { readonly distributed: U['kind']; readonly resolved: U['payload'] }\n`;
  code += `  : never;\n\n`;

  return code;
}

// Generate deep interface hierarchy
function genInterfaceHierarchy(prefix, depth) {
  let code = '';
  for (let i = 0; i < depth; i++) {
    const ext = i > 0 ? ` extends ${prefix}Level${i - 1}<T>` : '';
    code += `export interface ${prefix}Level${i}<T>${ext} {\n`;
    code += `  readonly ${prefix}_prop_${i}: T;\n`;
    code += `  readonly ${prefix}_meta_${i}: { readonly timestamp: number; readonly source: '${prefix}_${i}' };\n`;
    code += `}\n\n`;
  }
  return code;
}

// Generate mapped types
function genMappedTypes(prefix) {
  let code = '';
  code += `export type ${prefix}Keys<T> = {\n`;
  code += `  [K in keyof T as K extends string ? \`${prefix}_\${Uppercase<K>}\` : never]: T[K] extends object ? ${prefix}Keys<T[K]> : T[K];\n`;
  code += `};\n\n`;

  code += `export type ${prefix}ReadonlyDeep<T> = {\n`;
  code += `  readonly [K in keyof T]: T[K] extends object ? ${prefix}ReadonlyDeep<T[K]> : T[K];\n`;
  code += `};\n\n`;

  code += `export type ${prefix}PickByType<T, U> = {\n`;
  code += `  [K in keyof T as T[K] extends U ? K : never]: T[K];\n`;
  code += `};\n\n`;

  return code;
}

// Generate template literal types
function genTemplateLiterals(prefix) {
  const entities = Array.from({ length: 6 }, (_, i) => `'${prefix}Entity${i}'`);
  const actions = [`'create'`, `'read'`, `'update'`, `'delete'`, `'list'`, `'search'`];
  let code = '';
  code += `export type ${prefix}Entity = ${entities.join(' | ')};\n`;
  code += `export type ${prefix}Action = ${actions.join(' | ')};\n`;
  code += `export type ${prefix}Route = \`/api/\${${prefix}Entity}/\${${prefix}Action}\`;\n\n`;

  code += `export type ${prefix}ExtractEntity<T> = T extends \`/api/\${infer E}/\${string}\` ? E : never;\n`;
  code += `export type ${prefix}ExtractAction<T> = T extends \`/api/\${string}/\${infer A}\` ? A : never;\n\n`;

  code += `export type ${prefix}EventName<T extends string> = \`on\${Capitalize<T>}Changed\`;\n`;
  code += `export type ${prefix}AllEvents = ${prefix}EventName<${prefix}Action>;\n\n`;
  return code;
}

// Generate control flow functions (large switch/if chains)
function genControlFlow(prefix, cases) {
  let code = '';
  // Discriminated union
  const variants = [];
  for (let i = 0; i < cases; i++) {
    variants.push(`  | { readonly type: '${prefix}_case_${i}'; readonly value_${i}: number; readonly label_${i}: string }`);
  }
  code += `export type ${prefix}Event =\n${variants.join('\n')};\n\n`;

  // Handler with big switch
  code += `export function ${prefix}Handle(event: ${prefix}Event): string {\n`;
  code += `  switch (event.type) {\n`;
  for (let i = 0; i < cases; i++) {
    code += `    case '${prefix}_case_${i}':\n`;
    code += `      return \`Handled \${event.value_${i}} with \${event.label_${i}}\`;\n`;
  }
  code += `  }\n`;
  code += `}\n\n`;

  // Narrowing function
  code += `export function ${prefix}Narrow(event: ${prefix}Event): number {\n`;
  for (let i = 0; i < cases; i++) {
    code += `  ${i === 0 ? 'if' : 'else if'} (event.type === '${prefix}_case_${i}') {\n`;
    code += `    return event.value_${i} * ${i + 1};\n`;
    code += `  }\n`;
  }
  code += `  return 0;\n`;
  code += `}\n\n`;

  return code;
}

// Generate generic function instantiations
function genGenericInstantiations(prefix) {
  let code = '';
  code += `export function ${prefix}Transform<A, B, C>(a: A, fn: (a: A) => B, map: (b: B) => C): C {\n`;
  code += `  return map(fn(a));\n`;
  code += `}\n\n`;

  code += `export function ${prefix}Pipe<A, B>(a: A, fn: (a: A) => B): B;\n`;
  code += `export function ${prefix}Pipe<A, B, C>(a: A, fn1: (a: A) => B, fn2: (b: B) => C): C;\n`;
  code += `export function ${prefix}Pipe<A, B, C, D>(a: A, fn1: (a: A) => B, fn2: (b: B) => C, fn3: (c: C) => D): D;\n`;
  code += `export function ${prefix}Pipe(a: unknown, ...fns: Array<(x: unknown) => unknown>): unknown {\n`;
  code += `  return fns.reduce((acc, fn) => fn(acc), a);\n`;
  code += `}\n\n`;

  // Many instantiations
  code += `export const ${prefix}Results = {\n`;
  for (let i = 0; i < 20; i++) {
    code += `  r${i}: ${prefix}Transform<number, string, boolean>(${i}, (n) => String(n), (s) => s.length > 0),\n`;
  }
  code += `} as const;\n\n`;

  return code;
}

// Generate branded types and satisfies
function genBrandedTypes(prefix) {
  let code = '';
  const brands = ['Id', 'Slug', 'Email', 'Token', 'Hash'];
  for (const brand of brands) {
    code += `declare const ${prefix}${brand}Brand: unique symbol;\n`;
    code += `export type ${prefix}${brand} = string & { readonly [${prefix}${brand}Brand]: typeof ${prefix}${brand}Brand };\n\n`;
  }

  code += `export function ${prefix}CreateId(raw: string): ${prefix}Id {\n`;
  code += `  if (raw.length === 0) throw new Error('Empty ${prefix} id');\n`;
  code += `  return raw as ${prefix}Id;\n`;
  code += `}\n\n`;

  // satisfies usage
  code += `export const ${prefix}Config = {\n`;
  code += `  maxRetries: 3,\n`;
  code += `  timeout: 5000,\n`;
  code += `  prefix: '${prefix}',\n`;
  code += `} satisfies Record<string, string | number>;\n\n`;

  return code;
}

// Generate recursive types
function genRecursiveTypes(prefix) {
  let code = '';
  // Recursive tuple builder
  code += `export type ${prefix}BuildTuple<N extends number, T extends unknown[] = []> =\n`;
  code += `  T['length'] extends N ? T : ${prefix}BuildTuple<N, [...T, unknown]>;\n\n`;

  // Deep path type
  code += `export type ${prefix}Paths<T, Depth extends unknown[] = []> =\n`;
  code += `  Depth['length'] extends 5 ? never :\n`;
  code += `  T extends object\n`;
  code += `    ? { [K in keyof T & string]: K | \`\${K}.\${${prefix}Paths<T[K], [...Depth, unknown]>}\` }[keyof T & string]\n`;
  code += `    : never;\n\n`;

  // Deep partial
  code += `export type ${prefix}DeepPartial<T> = T extends object\n`;
  code += `  ? { [K in keyof T]?: ${prefix}DeepPartial<T[K]> }\n`;
  code += `  : T;\n\n`;

  return code;
}

// Generate a service-like module that creates its own types (safe, no cross-package type imports)
function genServiceModule(prefix, depAliases) {
  let code = '';

  // Import side-effect only to create the dependency edge for tsc
  for (const alias of depAliases) {
    code += `import type {} from '${alias}';\n`;
  }
  if (depAliases.length > 0) code += '\n';

  // Generate standalone complex types that exercise the checker
  code += `export interface ${prefix}ServiceConfig {\n`;
  code += `  readonly name: string;\n`;
  code += `  readonly version: \`\${number}.\${number}.\${number}\`;\n`;
  code += `  readonly features: ReadonlyArray<string>;\n`;
  code += `}\n\n`;

  code += `export type ${prefix}ServiceState = 'idle' | 'starting' | 'running' | 'stopping' | 'error';\n\n`;

  code += `export type ${prefix}ServiceEvent<S extends ${prefix}ServiceState> =\n`;
  code += `  S extends 'idle' ? { readonly action: 'start'; readonly config: ${prefix}ServiceConfig } :\n`;
  code += `  S extends 'running' ? { readonly action: 'stop' | 'restart'; readonly reason: string } :\n`;
  code += `  S extends 'error' ? { readonly action: 'retry' | 'abort'; readonly errorCode: number } :\n`;
  code += `  never;\n\n`;

  return code;
}

// --- Package Creation ---

function createPackage(tier, name, deps, linesTarget) {
  const pkgDir = path.join(PACKAGES_DIR, tier, name);
  const srcDir = path.join(pkgDir, 'src');
  ensureDir(srcDir);

  // package.json
  const pkgName = `@${tier}/${name}`;
  const pkgJson = {
    name: pkgName,
    version: '0.0.1',
    private: true,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    exports: {
      '.': './src/index.ts',
      './src': './src/index.ts',
      './*': './src/*.ts',
      './src/*': './src/*.ts',
    },
    scripts: {
      build: 'tsc -b',
    },
  };
  writeJSON(path.join(pkgDir, 'package.json'), pkgJson);

  // tsconfig.json with references
  const references = deps.map(d => ({
    path: `../../${d.tier}/${d.name}/tsconfig.json`,
  }));
  const tsconfig = {
    extends: '../../../tsconfig.base.json',
    compilerOptions: {
      outDir: './dist',
      composite: true,
      declaration: true,
    },
    include: ['src/**/*'],
    references,
  };
  writeJSON(path.join(pkgDir, 'tsconfig.json'), tsconfig);

  // Generate source files
  const prefix = name.replace(/-/g, '_').replace(/g\d+$/, '');
  const files = [];
  let totalLines = 0;

  // File 1: Types (conditional, mapped, template literals)
  let typeCode = '// Generated type-level computation module\n\n';
  typeCode += genConditionalTypes(`${prefix}CT`, 8);
  typeCode += genMappedTypes(`${prefix}MT`);
  typeCode += genTemplateLiterals(`${prefix}TL`);
  typeCode += genRecursiveTypes(`${prefix}RT`);
  fs.writeFileSync(path.join(srcDir, 'types.ts'), typeCode);
  files.push('types');
  totalLines += typeCode.split('\n').length;

  // File 2: Hierarchy (deep interfaces)
  let hierCode = '// Generated deep interface hierarchy\n\n';
  hierCode += genInterfaceHierarchy(`${prefix}H`, 40);
  hierCode += genBrandedTypes(`${prefix}B`);
  fs.writeFileSync(path.join(srcDir, 'hierarchy.ts'), hierCode);
  files.push('hierarchy');
  totalLines += hierCode.split('\n').length;

  // File 3: Control flow
  let cfCode = '// Generated control flow stress module\n\n';
  cfCode += genControlFlow(`${prefix}CF`, 40);
  cfCode += genGenericInstantiations(`${prefix}GI`);
  fs.writeFileSync(path.join(srcDir, 'control-flow.ts'), cfCode);
  files.push('control-flow');
  totalLines += cfCode.split('\n').length;

  // File 4: Integration module importing from deps
  if (deps.length > 0) {
    const depAliases = deps.slice(0, 3).map(d => `@${d.tier}/${d.name}`);
    let intCode = '// Generated integration module\n\n';
    intCode += genServiceModule(`${prefix}Int`, depAliases);
    intCode += genConditionalTypes(`${prefix}Int`, 6);
    intCode += genControlFlow(`${prefix}IntCF`, 25);
    fs.writeFileSync(path.join(srcDir, 'integration.ts'), intCode);
    files.push('integration');
    totalLines += intCode.split('\n').length;
  }

  // File 5+: Extra bulk if needed
  let extraIdx = 0;
  while (totalLines < linesTarget) {
    let extraCode = `// Generated bulk module ${extraIdx}\n\n`;
    const ep = `${prefix}X${extraIdx}`;
    extraCode += genInterfaceHierarchy(`${ep}H`, 30);
    extraCode += genConditionalTypes(`${ep}CT`, 6);
    extraCode += genControlFlow(`${ep}CF`, 30);
    extraCode += genBrandedTypes(`${ep}B`);
    extraCode += genGenericInstantiations(`${ep}GI`);
    const fname = `bulk-${extraIdx}`;
    fs.writeFileSync(path.join(srcDir, `${fname}.ts`), extraCode);
    files.push(fname);
    totalLines += extraCode.split('\n').length;
    extraIdx++;
  }

  // index.ts
  let indexCode = files.map(f => `export * from './${f}';`).join('\n') + '\n';
  fs.writeFileSync(path.join(srcDir, 'index.ts'), indexCode);
  totalLines += files.length + 1;

  return { pkgName, totalLines, dir: pkgDir };
}

// --- Main ---

function main() {
  const existing = getExistingPackages();
  console.log('Existing packages per tier:');
  for (const [tier, pkgs] of Object.entries(existing)) {
    console.log(`  ${tier}: ${pkgs.length}`);
  }

  // Strategy: Create chains of new packages that go deep
  // Layer 0 (shared) -> Layer 1 (domain) -> Layer 2 (data) -> Layer 3 (service) -> Layer 4 (app)
  // Each new package references 1-3 packages from the previous tier (both existing and newly created)

  const newPackages = {};
  for (const tier of TIER_ORDER) {
    newPackages[tier] = [];
  }

  // How many chains to create
  const CHAINS = 8;
  // Lines per package target
  const LINES_PER_PKG = 500;
  // Calculate needed packages
  const totalPkgsNeeded = Math.ceil(LINES_TARGET / LINES_PER_PKG);
  const pkgsPerTier = Math.ceil(totalPkgsNeeded / TIER_ORDER.length);

  console.log(`\nTarget: ${LINES_TARGET} new lines`);
  console.log(`Creating ~${pkgsPerTier} packages per tier, ~${LINES_PER_PKG} lines each`);

  let totalNewLines = 0;
  const createdPackages = []; // { tier, name, pkgName }

  for (let chain = 0; chain < CHAINS; chain++) {
    if (totalNewLines >= LINES_TARGET) break;

    const chainPrefix = `chain${BATCH}-${chain}`;
    let prevTierPkgs = []; // deps from previous tier in this chain

    for (let tierIdx = 0; tierIdx < TIER_ORDER.length; tierIdx++) {
      if (totalNewLines >= LINES_TARGET) break;

      const tier = TIER_ORDER[tierIdx];
      // Multiple packages per tier per chain
      const pkgsInThisTierChain = tierIdx === 0 ? 2 : Math.ceil(pkgsPerTier / CHAINS);

      for (let p = 0; p < pkgsInThisTierChain; p++) {
        if (totalNewLines >= LINES_TARGET) break;

        const name = genName(chainPrefix);

        // Build dependencies
        const deps = [];

        // Reference packages from previous tier in this chain
        for (const prev of prevTierPkgs.slice(0, 2)) {
          deps.push(prev);
        }

        // Also reference some existing packages from lower tiers for deeper cross-references
        if (tierIdx > 0) {
          const lowerTier = TIER_ORDER[tierIdx - 1];
          const lowerPkgs = existing[lowerTier] || [];
          if (lowerPkgs.length > 0) {
            const picked = pick(lowerPkgs, 2);
            for (const pkgName of picked) {
              deps.push({ tier: lowerTier, name: pkgName });
            }
          }
        }

        // Always reference shared/type-level for cache invalidation
        if (tier !== 'shared') {
          deps.push({ tier: 'shared', name: 'type-level' });
        }

        // Reference shared/core and shared/result for more depth
        if (tier !== 'shared' && tierIdx >= 2) {
          deps.push({ tier: 'shared', name: 'core' });
          deps.push({ tier: 'shared', name: 'result' });
        }

        const result = createPackage(tier, name, deps, LINES_PER_PKG);
        totalNewLines += result.totalLines;
        const pkgEntry = { tier, name };
        newPackages[tier].push(pkgEntry);
        createdPackages.push(pkgEntry);

        prevTierPkgs.push(pkgEntry);
        console.log(`  Created ${result.pkgName} (${result.totalLines} lines, deps: ${deps.length})`);
      }

      // For next tier, use this tier's packages as deps
      prevTierPkgs = newPackages[tier].slice(-pkgsInThisTierChain);
    }
  }

  // Update root tsconfig.json with new references
  const rootTsconfig = readJSON(path.join(ROOT, 'tsconfig.json'));
  const existingRefs = new Set(rootTsconfig.references.map(r => r.path));
  for (const pkg of createdPackages) {
    const refPath = `./packages/${pkg.tier}/${pkg.name}`;
    if (!existingRefs.has(refPath)) {
      rootTsconfig.references.push({ path: refPath });
      existingRefs.add(refPath);
    }
  }
  writeJSON(path.join(ROOT, 'tsconfig.json'), rootTsconfig);

  // Update tsconfig.base.json paths for new packages
  const baseTsconfig = readJSON(path.join(ROOT, 'tsconfig.base.json'));
  const paths = baseTsconfig.compilerOptions.paths || {};
  for (const pkg of createdPackages) {
    const alias = `@${pkg.tier}/${pkg.name}`;
    if (!paths[alias]) {
      paths[alias] = [`packages/${pkg.tier}/${pkg.name}/src/index.ts`];
    }
  }
  baseTsconfig.compilerOptions.paths = paths;
  writeJSON(path.join(ROOT, 'tsconfig.base.json'), baseTsconfig);

  console.log(`\nGeneration complete:`);
  console.log(`  New packages: ${createdPackages.length}`);
  console.log(`  Estimated new lines: ${totalNewLines}`);
  console.log(`  Root tsconfig references: ${rootTsconfig.references.length}`);
}

main();
