#!/usr/bin/env bash
# Seed Apicurio Registry from /schemas/<group>/<artifact>/{v*.json,_meta.json}.
# Runs once on startup. Idempotent: skips existing artifacts/versions.

set -euo pipefail

REGISTRY_URL="${REGISTRY_URL:-http://apicurio-registry:8080}"
SCHEMAS_DIR="${SCHEMAS_DIR:-/schemas}"
API="$REGISTRY_URL/apis/registry/v3"

echo "Waiting for Apicurio at $REGISTRY_URL ..."
for i in $(seq 1 60); do
  if curl -fsS "$API/system/info" >/dev/null 2>&1; then
    echo "  ready."
    break
  fi
  sleep 2
  if [[ "$i" == "60" ]]; then
    echo "  timeout" >&2
    exit 1
  fi
done

ensure_group() {
  local group="$1"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$API/groups/$group")
  if [[ "$code" == "200" ]]; then return; fi
  curl -sSf -X POST "$API/groups" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg g "$group" '{groupId: $g}')" >/dev/null
  echo "  group: $group"
}

artifact_exists() {
  local group="$1" artifact="$2"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$API/groups/$group/artifacts/$artifact")
  [[ "$code" == "200" ]]
}

version_exists() {
  local group="$1" artifact="$2" version="$3"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" "$API/groups/$group/artifacts/$artifact/versions/$version")
  [[ "$code" == "200" ]]
}

create_artifact_v1() {
  local group="$1" artifact="$2" version="$3" meta_file="$4" schema_file="$5"
  local name labels content payload
  name=$(jq -r '.name // empty' "$meta_file")
  labels=$(jq -c '.labels // {}' "$meta_file")
  content=$(jq -Rs . < "$schema_file")
  payload=$(jq -n \
    --arg artifactId "$artifact" \
    --arg name "${name:-$artifact}" \
    --arg version "$version" \
    --argjson labels "$labels" \
    --argjson content "$content" \
    '{
      artifactId: $artifactId,
      artifactType: "JSON",
      name: $name,
      labels: $labels,
      firstVersion: {
        version: $version,
        content: { content: $content, contentType: "application/json" }
      }
    }')
  curl -sSf -X POST "$API/groups/$group/artifacts" \
    -H "Content-Type: application/json" --data-binary "$payload" >/dev/null
  echo "  created $group/$artifact v$version"
}

create_version() {
  local group="$1" artifact="$2" version="$3" schema_file="$4"
  local content payload
  content=$(jq -Rs . < "$schema_file")
  payload=$(jq -n \
    --arg version "$version" \
    --argjson content "$content" \
    '{ version: $version, content: { content: $content, contentType: "application/json" } }')
  curl -sSf -X POST "$API/groups/$group/artifacts/$artifact/versions" \
    -H "Content-Type: application/json" --data-binary "$payload" >/dev/null
  echo "  created $group/$artifact v$version"
}

ensure_compat_rule() {
  local group="$1" artifact="$2" level="$3"
  [[ -z "$level" || "$level" == "null" ]] && return
  local payload code
  payload=$(jq -n --arg l "$level" '{ruleType: "COMPATIBILITY", config: $l}')
  code=$(curl -sS -o /dev/null -w "%{http_code}" \
    "$API/groups/$group/artifacts/$artifact/rules/COMPATIBILITY")
  if [[ "$code" == "200" ]]; then
    curl -sSf -X PUT "$API/groups/$group/artifacts/$artifact/rules/COMPATIBILITY" \
      -H "Content-Type: application/json" --data-binary "$payload" >/dev/null
  else
    curl -sSf -X POST "$API/groups/$group/artifacts/$artifact/rules" \
      -H "Content-Type: application/json" --data-binary "$payload" >/dev/null
  fi
  echo "    compat: $level"
}

shopt -s nullglob

for group_dir in "$SCHEMAS_DIR"/*/; do
  group=$(basename "$group_dir")
  ensure_group "$group"

  for artifact_dir in "$group_dir"*/; do
    artifact=$(basename "$artifact_dir")
    meta_file="$artifact_dir/_meta.json"
    [[ -f "$meta_file" ]] || { echo "  skip $group/$artifact (no _meta.json)"; continue; }

    # Sort version files numerically: v1.json, v2.json, ...
    mapfile -t versions < <(ls -1 "$artifact_dir"v*.json 2>/dev/null | sort -V)
    [[ ${#versions[@]} -gt 0 ]] || { echo "  skip $group/$artifact (no v*.json)"; continue; }

    if ! artifact_exists "$group" "$artifact"; then
      first="${versions[0]}"
      v=$(basename "$first" .json); v="${v#v}"
      create_artifact_v1 "$group" "$artifact" "$v" "$meta_file" "$first"
      compat=$(jq -r '.compatibility // empty' "$meta_file")
      ensure_compat_rule "$group" "$artifact" "$compat"
      versions=("${versions[@]:1}")
    fi

    for vfile in "${versions[@]}"; do
      v=$(basename "$vfile" .json); v="${v#v}"
      if version_exists "$group" "$artifact" "$v"; then
        echo "  exists  $group/$artifact v$v"
        continue
      fi
      create_version "$group" "$artifact" "$v" "$vfile"
    done
  done
done

echo "Seed complete."
