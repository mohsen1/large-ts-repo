#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
readme="$root/README.md"

if ! command -v cloc >/dev/null 2>&1; then
  echo "error: cloc is required. install with: brew install cloc" >&2
  exit 1
fi

cloc_csv="$(
  cloc "$root" \
    --include-lang=TypeScript \
    --exclude-dir=node_modules,dist \
    --csv \
    --quiet
)"

ts_row="$(printf '%s\n' "$cloc_csv" | awk -F, '$2=="TypeScript"{print; exit}')"

if [ -z "$ts_row" ]; then
  file_count=0
  blank_lines=0
  comment_lines=0
  code_lines=0
else
  file_count="$(printf '%s' "$ts_row" | awk -F, '{print $1}')"
  blank_lines="$(printf '%s' "$ts_row" | awk -F, '{print $3}')"
  comment_lines="$(printf '%s' "$ts_row" | awk -F, '{print $4}')"
  code_lines="$(printf '%s' "$ts_row" | awk -F, '{print $5}')"
fi

total_lines="$code_lines"

fmt_int() {
  awk -v n="$1" 'function c(x){s=sprintf("%.0f",x); out=""; while(length(s)>3){out="," substr(s,length(s)-2) out; s=substr(s,1,length(s)-3)} print s out} BEGIN{c(n)}'
}

pretty_files="$(fmt_int "$file_count")"
pretty_total="$(fmt_int "$total_lines")"
pretty_blank="$(fmt_int "$blank_lines")"
pretty_comment="$(fmt_int "$comment_lines")"

echo "TOTAL_TS_LINES=$total_lines"
echo "TOTAL_TS_FILES=$file_count"
echo "TOTAL_TS_BLANK_LINES=$blank_lines"
echo "TOTAL_TS_COMMENT_LINES=$comment_lines"

if ! grep -q '<!-- LOC:START -->' "$readme"; then
  {
    echo ""
    echo "## Lines of Code"
    echo ""
    echo "<!-- LOC:START -->"
    echo "<!-- LOC:END -->"
  } >> "$readme"
fi

if ! grep -q '<!-- LOC:END -->' "$readme"; then
  echo "<!-- LOC:END -->" >> "$readme"
fi

timestamp=$(date '+%Y-%m-%d %H:%M:%S')
awk -v files="$pretty_files" -v code="$pretty_total" -v blank="$pretty_blank" -v comments="$pretty_comment" -v t="$timestamp" '
  /<!-- LOC:START -->/ {
    print;
    print "";
    print "| Metric | Value |";
    print "| :-- | --: |";
    print "| TypeScript files | **" files "** |";
    print "| Code lines | **" code "** |";
    print "| Blank lines | " blank " |";
    print "| Comment lines | " comments " |";
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
