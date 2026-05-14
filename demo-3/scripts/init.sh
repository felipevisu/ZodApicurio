#!/usr/bin/env bash
# Bootstrap Apicurio: wait for it, set global BACKWARD rule,
# create group `demo`, publish initial user.json schema.
# Runs inside docker network → hits apicurio-registry directly (no nginx/token).

set -euo pipefail

REGISTRY_URL="${REGISTRY_URL:-http://apicurio-registry:8080}"
GROUP_ID="${GROUP_ID:-demo}"
COMPAT_LEVEL="${COMPAT_LEVEL:-BACKWARD}"
SCHEMAS_DIR="${SCHEMAS_DIR:-/schemas}"

echo "Waiting for Apicurio Registry at $REGISTRY_URL ..."
for i in $(seq 1 60); do
  if curl -fsS "$REGISTRY_URL/apis/registry/v3/system/info" >/dev/null 2>&1; then
    echo "Apicurio ready."
    break
  fi
  sleep 2
  if [[ "$i" == "60" ]]; then
    echo "Apicurio did not become ready in time" >&2
    exit 1
  fi
done

echo "Setting global COMPATIBILITY rule to $COMPAT_LEVEL ..."
RULE_PAYLOAD=$(jq -n --arg level "$COMPAT_LEVEL" \
  '{ ruleType: "COMPATIBILITY", config: $level }')
HTTP=$(curl -sS -o /tmp/rule.json -w "%{http_code}" \
  -X POST "$REGISTRY_URL/apis/registry/v3/admin/rules" \
  -H "Content-Type: application/json" \
  --data-binary "$RULE_PAYLOAD")
case "$HTTP" in
  20*) echo "  rule created" ;;
  409)
    echo "  rule exists, updating..."
    curl -sS -X PUT "$REGISTRY_URL/apis/registry/v3/admin/rules/COMPATIBILITY" \
      -H "Content-Type: application/json" \
      --data-binary "$(jq -n --arg level "$COMPAT_LEVEL" '{config: $level}')" >/dev/null
    ;;
  *) echo "  FAIL ($HTTP)"; cat /tmp/rule.json; exit 1 ;;
esac

echo "Ensuring group '$GROUP_ID' exists ..."
HTTP=$(curl -sS -o /tmp/group.json -w "%{http_code}" \
  -X POST "$REGISTRY_URL/apis/registry/v3/groups" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -n --arg id "$GROUP_ID" '{groupId: $id, description: "demo-3 schemas"}')")
case "$HTTP" in
  20*) echo "  group created" ;;
  409) echo "  group exists" ;;
  *) echo "  FAIL ($HTTP)"; cat /tmp/group.json; exit 1 ;;
esac

for FILE in "$SCHEMAS_DIR"/*.json; do
  [[ -f "$FILE" ]] || continue
  ARTIFACT_ID="$(basename "$FILE" .json)"
  echo "Publishing $ARTIFACT_ID from $FILE ..."

  # Skip if artifact already exists (idempotent bootstrap)
  EXISTS_HTTP=$(curl -sS -o /dev/null -w "%{http_code}" \
    "$REGISTRY_URL/apis/registry/v3/groups/$GROUP_ID/artifacts/$ARTIFACT_ID")
  if [[ "$EXISTS_HTTP" == "200" ]]; then
    echo "  exists, skipping"
    continue
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
  HTTP=$(curl -sS -o /tmp/pub.json -w "%{http_code}" \
    -X POST "$REGISTRY_URL/apis/registry/v3/groups/$GROUP_ID/artifacts" \
    -H "Content-Type: application/json" \
    --data-binary "$PAYLOAD")
  if [[ "$HTTP" =~ ^2 ]]; then
    echo "  OK ($HTTP)"
  else
    echo "  FAIL ($HTTP)" >&2
    cat /tmp/pub.json >&2
    exit 1
  fi
done

echo "Bootstrap complete."
