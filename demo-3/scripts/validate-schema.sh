#!/usr/bin/env bash
# Dry-run publish a schema. Apicurio runs compatibility checks without persisting.
# Exit 0 if compatible, non-zero (and prints rule violations) if not.
#
# Required env:
#   APICURIO_URL    e.g. https://abc-123.ngrok-free.app
#   WRITE_TOKEN     must match nginx WRITE_TOKEN
#   GROUP_ID        registry group, e.g. default
#
# Args:
#   $1  path to .json schema file
#   $2  artifactId (defaults to filename without extension)

set -euo pipefail

: "${APICURIO_URL:?APICURIO_URL is required}"
: "${WRITE_TOKEN:?WRITE_TOKEN is required}"
: "${GROUP_ID:=default}"

FILE="${1:?path to schema file required}"
ARTIFACT_ID="${2:-$(basename "$FILE" .json)}"

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

CONTENT="$(jq -Rs . < "$FILE")"

PAYLOAD=$(jq -n \
  --arg artifactId "$ARTIFACT_ID" \
  --argjson content "$CONTENT" \
  '{
    artifactId: $artifactId,
    artifactType: "JSON",
    firstVersion: {
      content: { content: $content, contentType: "application/json" }
    }
  }')

echo "Dry-run validation of $ARTIFACT_ID against group $GROUP_ID..."
echo "  URL: $APICURIO_URL/apis/registry/v3/groups/$GROUP_ID/artifacts?ifExists=CREATE_VERSION&dryRun=true"

BODY_FILE=$(mktemp)
HEADERS_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE" "$HEADERS_FILE"' EXIT

HTTP_CODE=$(curl -sS -o "$BODY_FILE" -D "$HEADERS_FILE" -w "%{http_code}" \
  -X POST "$APICURIO_URL/apis/registry/v3/groups/$GROUP_ID/artifacts?ifExists=CREATE_VERSION&dryRun=true" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "X-Auth-Token: $WRITE_TOKEN" \
  -H "ngrok-skip-browser-warning: true" \
  --data-binary "$PAYLOAD")

CONTENT_TYPE=$(awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' "$HEADERS_FILE" | tr -d '\r\n' || true)
SIZE=$(wc -c < "$BODY_FILE" | tr -d ' ')

print_body() {
  if [[ "$CONTENT_TYPE" == *application/json* ]]; then
    if command -v jq >/dev/null 2>&1 && jq -e . "$BODY_FILE" >/dev/null 2>&1; then
      jq . "$BODY_FILE"
    else
      cat "$BODY_FILE"
    fi
  elif [[ "$CONTENT_TYPE" == *text/html* ]] || head -c 64 "$BODY_FILE" | grep -qiE '<html|<!doctype'; then
    echo "<HTML body, $SIZE bytes — Apicurio did not respond. Likely upstream proxy error.>"
    if grep -qi 'ERR_NGROK_8012\|connection refused' "$BODY_FILE"; then
      echo "Cause: ngrok could not reach the local upstream. Check that docker compose is up and listening on the right host port."
    elif grep -qi 'ERR_NGROK' "$BODY_FILE"; then
      grep -oE 'ERR_NGROK_[0-9]+' "$BODY_FILE" | head -1
    fi
  else
    echo "(content-type: ${CONTENT_TYPE:-unknown}, $SIZE bytes)"
    head -c 1024 "$BODY_FILE"
    [[ "$SIZE" -gt 1024 ]] && echo "...[truncated]"
  fi
}

echo "  HTTP $HTTP_CODE (content-type: ${CONTENT_TYPE:-unknown})"

case "$HTTP_CODE" in
  20*)
    echo "COMPATIBLE"
    print_body
    ;;
  409)
    echo "INCOMPATIBLE — schema breaks compatibility rule" >&2
    print_body >&2
    exit 1
    ;;
  4*)
    echo "CLIENT ERROR ($HTTP_CODE)" >&2
    print_body >&2
    exit 2
    ;;
  5*)
    echo "SERVER/UPSTREAM ERROR ($HTTP_CODE)" >&2
    print_body >&2
    exit 3
    ;;
  *)
    echo "UNEXPECTED ($HTTP_CODE)" >&2
    print_body >&2
    exit 4
    ;;
esac
