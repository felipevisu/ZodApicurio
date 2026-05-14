#!/usr/bin/env bash
# Configure global compatibility rule on Apicurio Registry.
# Run once after `docker compose up`.
#
# Required env:
#   APICURIO_URL    e.g. http://localhost:38080
#   WRITE_TOKEN     must match nginx WRITE_TOKEN
#   COMPAT_LEVEL    BACKWARD | BACKWARD_TRANSITIVE | FORWARD | FORWARD_TRANSITIVE | FULL | FULL_TRANSITIVE
#                   (defaults to BACKWARD)

set -euo pipefail

: "${APICURIO_URL:?APICURIO_URL is required}"
: "${WRITE_TOKEN:?WRITE_TOKEN is required}"
: "${COMPAT_LEVEL:=BACKWARD}"

PAYLOAD=$(jq -n --arg level "$COMPAT_LEVEL" \
  '{ ruleType: "COMPATIBILITY", config: $level }')

echo "Setting global COMPATIBILITY rule to $COMPAT_LEVEL..."

HTTP_CODE=$(curl -sS -o /tmp/apicurio-rule.json -w "%{http_code}" \
  -X POST "$APICURIO_URL/apis/registry/v3/admin/rules" \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $WRITE_TOKEN" \
  --data-binary "$PAYLOAD")

case "$HTTP_CODE" in
  20*) echo "Created ($HTTP_CODE)"; jq . /tmp/apicurio-rule.json ;;
  409)
    echo "Rule already exists, updating..."
    UPDATE_PAYLOAD=$(jq -n --arg level "$COMPAT_LEVEL" '{ config: $level }')
    curl -sS -X PUT "$APICURIO_URL/apis/registry/v3/admin/rules/COMPATIBILITY" \
      -H "Content-Type: application/json" \
      -H "X-Auth-Token: $WRITE_TOKEN" \
      --data-binary "$UPDATE_PAYLOAD"
    echo "Updated to $COMPAT_LEVEL"
    ;;
  *)
    echo "FAIL ($HTTP_CODE)" >&2
    cat /tmp/apicurio-rule.json >&2
    exit 1
    ;;
esac
