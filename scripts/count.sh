#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
readme="$root/README.md"

total_lines=0
file_count=0
while IFS= read -r line_count; do
  if [ -n "$line_count" ]; then
    file_count=$((file_count + 1))
    total_lines=$((total_lines + line_count))
  fi
done < <(find "$root" -type f -name '*.ts' ! -path '*/node_modules/*' ! -path '*/dist/*' 2>/dev/null -print0 | xargs -0 wc -l | awk '{print $1}')

echo "TOTAL_TS_LINES=$total_lines"
echo "TOTAL_TS_FILES=$file_count"

grep -q '<!-- LOC:START -->' "$readme" || printf '%s\n%s\n' '<!-- LOC:START -->' '<!-- LOC:END -->' >> "$readme"

timestamp=$(date '+%Y-%m-%d %H:%M:%S')
awk -v l="$total_lines" -v f="$file_count" -v t="Last updated: $timestamp" '
  /<!-- LOC:START -->/ {
    print;
    print "TOTAL_TS_LINES=" l;
    print "TOTAL_TS_FILES=" f;
    print t;
    skip=1;
    next;
  }
  /<!-- LOC:END -->/ { skip=0; next; }
  !skip
' "$readme" > "$readme.tmp"

mv "$readme.tmp" "$readme"

echo "Updated LOC metrics in $readme"
