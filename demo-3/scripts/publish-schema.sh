#!/usr/bin/env bash
# Publish a JSON Schema file to Apicurio Registry (real write, auto-version).
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

echo "Publishing $ARTIFACT_ID to group $GROUP_ID..."

HTTP_CODE=$(curl -sS -o /tmp/apicurio-response.json -w "%{http_code}" \
  -X POST "$APICURIO_URL/apis/registry/v3/groups/$GROUP_ID/artifacts?ifExists=CREATE_VERSION" \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $WRITE_TOKEN" \
  --data-binary "$PAYLOAD")

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo "OK ($HTTP_CODE)"
  jq . /tmp/apicurio-response.json
else
  echo "FAIL ($HTTP_CODE)" >&2
  cat /tmp/apicurio-response.json >&2
  exit 1
fi
