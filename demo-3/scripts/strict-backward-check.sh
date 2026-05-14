#!/usr/bin/env bash
# Strict BACKWARD compatibility check for JSON Schema artifacts.
# Compensates for Apicurio's shallow built-in JSON-Schema compat checker.
#
# Fetches the latest registered version of $ARTIFACT_ID from Apicurio
# and compares it against $FILE. Exits 1 on any of:
#   - a property listed as required in the new version that wasn't required before
#   - a property present before but missing now
#   - the "type" of a still-present property changed
#   - "additionalProperties" went from true (or absent) to false
#
# Required env:
#   APICURIO_URL    e.g. http://localhost:38080
#   GROUP_ID        registry group, e.g. demo
#
# Args:
#   $1  path to new .json schema file
#   $2  artifactId (defaults to filename without extension)

set -euo pipefail

: "${APICURIO_URL:?APICURIO_URL is required}"
: "${GROUP_ID:=default}"

FILE="${1:?path to schema file required}"
ARTIFACT_ID="${2:-$(basename "$FILE" .json)}"

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

LATEST_URL="$APICURIO_URL/apis/registry/v3/groups/$GROUP_ID/artifacts/$ARTIFACT_ID/versions/branch=latest/content"
LATEST_FILE=$(mktemp)
trap 'rm -f "$LATEST_FILE"' EXIT

echo "Strict BACKWARD check for $ARTIFACT_ID..."
HTTP=$(curl -sS -o "$LATEST_FILE" -w "%{http_code}" \
  -H "Accept: application/json" \
  -H "ngrok-skip-browser-warning: true" \
  "$LATEST_URL")

if [[ "$HTTP" == "404" ]]; then
  echo "  no prior version; nothing to compare against. OK."
  exit 0
fi
if [[ ! "$HTTP" =~ ^2 ]]; then
  echo "  failed to fetch latest ($HTTP):" >&2
  head -c 512 "$LATEST_FILE" >&2; echo >&2
  exit 2
fi

if ! jq -e . "$LATEST_FILE" >/dev/null 2>&1; then
  echo "  latest version is not valid JSON, aborting strict check" >&2
  head -c 256 "$LATEST_FILE" >&2; echo >&2
  exit 2
fi

ADDED_REQUIRED=$(jq -n --slurpfile old "$LATEST_FILE" --slurpfile new "$FILE" \
  '($new[0].required // []) - ($old[0].required // [])')

REMOVED_PROPS=$(jq -n --slurpfile old "$LATEST_FILE" --slurpfile new "$FILE" \
  '(($old[0].properties // {}) | keys) - (($new[0].properties // {}) | keys)')

TYPE_CHANGES=$(jq -n --slurpfile old "$LATEST_FILE" --slurpfile new "$FILE" '
  ($old[0].properties // {}) as $op
  | ($new[0].properties // {}) as $np
  | [ ($op | keys[]) as $k
      | select($np[$k] != null and ($op[$k].type // null) != ($np[$k].type // null))
      | { property: $k, old: ($op[$k].type // null), new: ($np[$k].type // null) }
    ]
')

ADDPROPS_TIGHTENED=$(jq -n --slurpfile old "$LATEST_FILE" --slurpfile new "$FILE" '
  (($old[0].additionalProperties // true) != false) and
  (($new[0].additionalProperties // true) == false)
')

FAILED=0

if [[ "$ADDED_REQUIRED" != "[]" ]]; then
  echo "  ❌ new required fields added: $(echo "$ADDED_REQUIRED" | jq -c .)" >&2
  FAILED=1
fi
if [[ "$REMOVED_PROPS" != "[]" ]]; then
  echo "  ❌ properties removed: $(echo "$REMOVED_PROPS" | jq -c .)" >&2
  FAILED=1
fi
if [[ "$TYPE_CHANGES" != "[]" ]]; then
  echo "  ❌ property type changes: $(echo "$TYPE_CHANGES" | jq -c .)" >&2
  FAILED=1
fi
if [[ "$ADDPROPS_TIGHTENED" == "true" ]]; then
  echo "  ❌ additionalProperties tightened from open to false" >&2
  FAILED=1
fi

if [[ "$FAILED" == "1" ]]; then
  echo "STRICT BACKWARD CHECK FAILED — these changes break consumers of the prior version." >&2
  exit 1
fi

echo "  OK — no strict BACKWARD violations detected."
