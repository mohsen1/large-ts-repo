#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
readme="$root/README.md"

# --- Count TypeScript lines (without cloc) ---
# Use find + wc, piping through cat to avoid xargs splitting totals
file_count=$(find "$root" -name '*.ts' -not -path '*/node_modules/*' -not -path '*/dist/*' | wc -l)
code_lines=$(find "$root" -name '*.ts' -not -path '*/node_modules/*' -not -path '*/dist/*' -print0 | xargs -0 cat | wc -l)
blank_lines=$(find "$root" -name '*.ts' -not -path '*/node_modules/*' -not -path '*/dist/*' -print0 | xargs -0 grep -c '^$' 2>/dev/null | awk -F: '{s+=$NF} END{print s+0}')

# --- Count packages and project references ---
pkg_count=0
ref_count=0
max_depth=0

# Use a Python one-liner for reference depth analysis (json + graph traversal)
read -r pkg_count ref_count max_depth avg_depth <<< "$(python3 -c "
import json, os, functools
from collections import Counter

graph = {}
for root, dirs, files in os.walk('$root/packages'):
    dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist')]
    if 'tsconfig.json' in files:
        p = os.path.join(root, 'tsconfig.json')
        try:
            with open(p) as f:
                d = json.load(f)
            refs = []
            for ref in d.get('references', []):
                rpath = ref['path']
                if rpath.endswith('/tsconfig.json'):
                    rpath = rpath[:-len('/tsconfig.json')]
                refs.append(os.path.normpath(os.path.join(root, rpath)))
            graph[root] = refs
        except:
            graph[root] = []

@functools.lru_cache(maxsize=None)
def depth(node):
    children = graph.get(node, [])
    if not children:
        return 0
    return 1 + max(depth(c) for c in children)

depths = Counter()
for n in graph:
    depths[depth(n)] += 1

total_refs = sum(len(v) for v in graph.values())
max_d = max(depths) if depths else 0
avg_d = sum(d*c for d,c in depths.items()) / max(sum(depths.values()), 1)
print(f'{len(graph)} {total_refs} {max_d} {avg_d:.1f}')
")"

# --- Format numbers with commas ---
fmt_int() {
  awk -v n="$1" 'function c(x){s=sprintf("%.0f",x); out=""; while(length(s)>3){out="," substr(s,length(s)-2) out; s=substr(s,1,length(s)-3)} print s out} BEGIN{c(n)}'
}

pretty_files="$(fmt_int "$file_count")"
pretty_total="$(fmt_int "$code_lines")"
pretty_blank="$(fmt_int "$blank_lines")"
pretty_pkgs="$(fmt_int "$pkg_count")"
pretty_refs="$(fmt_int "$ref_count")"

echo "TOTAL_TS_FILES=$file_count"
echo "TOTAL_TS_LINES=$code_lines"
echo "TOTAL_TS_BLANK_LINES=$blank_lines"
echo "TOTAL_PACKAGES=$pkg_count"
echo "TOTAL_REFS=$ref_count"
echo "MAX_DEPTH=$max_depth"
echo "AVG_DEPTH=$avg_depth"

# --- Update README ---
if ! grep -q '<!-- LOC:START -->' "$readme"; then
  {
    echo ""
    echo "## Lines of Code"
    echo ""
    echo "<!-- LOC:START -->"
    echo "<!-- LOC:END -->"
  } >> "$readme"
fi

timestamp=$(date '+%Y-%m-%d')
awk -v files="$pretty_files" -v code="$pretty_total" -v blank="$pretty_blank" \
    -v pkgs="$pretty_pkgs" -v refs="$pretty_refs" -v maxd="$max_depth" \
    -v avgd="$avg_depth" -v t="$timestamp" '
  /<!-- LOC:START -->/ {
    print;
    print "";
    print "| Metric | Value |";
    print "| :-- | --: |";
    print "| TypeScript files | **" files "** |";
    print "| Code lines | **" code "** |";
    print "| Blank lines | " blank " |";
    print "| Packages | " pkgs " |";
    print "| Project references | " refs " |";
    print "| Max reference depth | " maxd " |";
    print "| Avg reference depth | " avgd " |";
    print "| Last updated | `" t "` |";
    print "";
    skip=1;
    next;
  }
  /<!-- LOC:END -->/ { skip=0; print; next; }
  !skip
' "$readme" > "$readme.tmp"

mv "$readme.tmp" "$readme"

echo "Updated LOC metrics in $readme"
