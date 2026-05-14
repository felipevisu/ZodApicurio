#!/usr/bin/env bash
# Publish a JSON Schema file to Apicurio Registry via the nginx-fronted endpoint.
#
# Required env:
#   APICURIO_URL    e.g. https://abc-123.ngrok-free.app
#   WRITE_TOKEN     must match nginx WRITE_TOKEN
#   GROUP_ID        registry group, e.g. demo
#
# Args:
#   $1  path to .json schema file
#   $2  artifactId (defaults to filename without extension)
#   $3  version (optional; if omitted, Apicurio auto-assigns 1, 2, 3, ...)

set -euo pipefail

: "${APICURIO_URL:?APICURIO_URL is required}"
: "${WRITE_TOKEN:?WRITE_TOKEN is required}"
: "${GROUP_ID:=default}"

FILE="${1:?path to schema file required}"
ARTIFACT_ID="${2:-$(basename "$FILE" .json)}"
VERSION="${3:-}"

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

CONTENT="$(jq -Rs . < "$FILE")"  # JSON-encode the schema body as a string

# Build firstVersion object; include "version" only when caller supplied one.
if [[ -n "$VERSION" ]]; then
  FIRST_VERSION=$(jq -n \
    --arg version "$VERSION" \
    --argjson content "$CONTENT" \
    '{ version: $version, content: { content: $content, contentType: "application/json" } }')
else
  FIRST_VERSION=$(jq -n \
    --argjson content "$CONTENT" \
    '{ content: { content: $content, contentType: "application/json" } }')
fi

PAYLOAD=$(jq -n \
  --arg artifactId "$ARTIFACT_ID" \
  --argjson firstVersion "$FIRST_VERSION" \
  '{ artifactId: $artifactId, artifactType: "JSON", firstVersion: $firstVersion }')

echo "Publishing $ARTIFACT_ID ${VERSION:+v$VERSION }to group $GROUP_ID..."

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
