# Demo 1 — Apicurio Registry (in-memory)

Apicurio Registry 3.0.6 + UI running locally, backed by Postgres on `tmpfs` (data is wiped on container restart — fine for demos).

## Start / Stop

```bash
docker compose up -d
docker compose down       # also wipes data (tmpfs)
```

## Access

| Service          | URL                                     |
| ---------------- | --------------------------------------- |
| Apicurio UI      | http://localhost:18888                  |
| Registry REST v3 | http://localhost:18080/apis/registry/v3 |
| OpenAPI docs     | http://localhost:18080/apis             |

Internal docker network: `demo-1`. Postgres is not published.

## Upload schema in the UI

1. Open http://localhost:18888
2. Click **Upload artifact**
3. Group: `demo` · Artifact ID: `product` · Type: `JSON Schema`
4. Paste contents of `product-schema.json`

## Fetch schemas from Bruno

> Bruno = open-source API client (https://www.usebruno.com). Examples below assume the artifact above was created with `groupId=demo` and `artifactId=product`.

### Base URL

Create an environment variable in Bruno:

```
APICURIO = http://localhost:18080/apis/registry/v3
```

### Requests

**List artifacts in group**
```
GET {{APICURIO}}/groups/demo/artifacts
```

**Get latest schema content**
```
GET {{APICURIO}}/groups/demo/artifacts/product/versions/branch=latest/content
Accept: application/json
```

**Get specific version content**
```
GET {{APICURIO}}/groups/demo/artifacts/product/versions/1/content
```

**Get artifact metadata**
```
GET {{APICURIO}}/groups/demo/artifacts/product
```

**List versions**
```
GET {{APICURIO}}/groups/demo/artifacts/product/versions
```

**Search by name**
```
GET {{APICURIO}}/search/artifacts?name=product
```

### Bruno collection snippet (.bru)

Save as `Get product schema.bru` in a Bruno collection:

```
meta {
  name: Get product schema
  type: http
  seq: 1
}

get {
  url: {{APICURIO}}/groups/demo/artifacts/product/versions/branch=latest/content
  body: none
  auth: none
}

headers {
  Accept: application/json
}
```

### Quick curl sanity check

```bash
curl -s http://localhost:18080/apis/registry/v3/groups/demo/artifacts/product/versions/branch=latest/content | jq
```
