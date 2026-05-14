# Data Service — final result

End-to-end demo: JSON Schemas seeded into Apicurio → Zod validators generated at runtime → Kafka pipeline routing → click-to-send UI.

## How it works

1. **Schemas live in `data-schemas/schemas/<group>/<artifact>/v*.json`** with a sibling `_meta.json` that carries the artifact's compatibility rule and pipeline labels.
2. **`apicurio-seed` init container** reads that tree on first boot and POSTs everything to Apicurio. Idempotent — re-running skips existing versions.
3. **`data-service-api`** polls Apicurio every 30s. For each version it calls `jsonSchemaToZod(schema)` → builds a Zod validator at runtime → registers `POST /:groupId/:artifactId/v:version` on Express → reconstructs the OpenAPI spec.
4. **`event-ui`** is a tiny nginx-served page with one card per scenario. Click ✓ to send a valid payload, ✗ to send an invalid one.
5. **Valid payloads** → Zod accepts → pipeline reads the artifact's labels and produces to Kafka (or persists to DB, stubbed). **Invalid** → 400 with structured errors, never touches Kafka.

## Quick start

```bash
docker compose up -d --build
```

Wait ~20s for Postgres, Apicurio, Kafka and the seed init to finish. Tail the seeder if you want to watch:

```bash
docker logs -f apicurio-seed
# Seed complete.
```

## URLs

| Service                | URL                          | Description                                       |
| ---------------------- | ---------------------------- | ------------------------------------------------- |
| **Event UI**           | http://localhost:4000        | Click-to-send demo (start here)                   |
| Data Service API       | http://localhost:3000        | Validation + routing API                          |
| Swagger UI             | http://localhost:3000/docs   | Generated OpenAPI docs                            |
| Apicurio UI            | http://localhost:8888        | Schema registry web UI                            |
| Apicurio Registry (RO) | http://localhost:8080        | Read-only proxy in front of registry              |
| Apicurio Registry      | http://localhost:8081        | Direct registry API (admin / writes)              |
| Kafka UI               | http://localhost:8090        | Browse Kafka topics + messages                    |

## Layout

```
final-result/
├── docker-compose.yml
├── apicurio-ui-config.js
├── nginx/nginx.conf              # read-only proxy in front of registry
├── init/seed-apicurio.sh         # init-container script: seeds registry from data-schemas/
├── data-schemas/
│   └── schemas/<group>/<artifact>/{_meta.json, v1.json, v2.json, ...}
├── data-service-api/             # Node + Express + Zod + json-schema-to-zod + kafkajs
└── event-ui/                     # static UI: button per scenario, posts to data-service-api
```

## Pipeline labels

Every artifact carries metadata in `_meta.json` that the data-service reads:

```json
{
  "name": "Stock Adjusted",
  "compatibility": "BACKWARD",
  "labels": {
    "pipeline.actions": "kafka,database",
    "pipeline.kafka.topic": "inventory.stock-adjusted",
    "pipeline.database.table": "stock_adjustments"
  }
}
```

| Label                     | Description                            | Example                     |
| ------------------------- | -------------------------------------- | --------------------------- |
| `pipeline.actions`        | Comma-separated actions                | `kafka,database`            |
| `pipeline.kafka.topic`    | Kafka topic to publish to              | `inventory.stock-adjusted`  |
| `pipeline.database.table` | DB table (stub for now)                | `stock_adjustments`         |

Change labels → restart `data-service-api` → routing changes. No code edits.

## Example request

```bash
curl -X POST http://localhost:3000/inventory/stock-adjusted/v1 \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "WIDGET-001",
    "warehouseId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "delta": -3,
    "reason": "sale",
    "adjustedAt": "2026-05-11T12:00:00Z"
  }'
```

Successful response includes Kafka partition + offset:

```json
{
  "valid": true,
  "data": { "...": "..." },
  "pipeline": [
    {
      "type": "kafka",
      "status": "sent",
      "destination": "inventory.stock-adjusted",
      "partition": 0,
      "offset": "0"
    },
    {
      "type": "database",
      "status": "persisted",
      "destination": "stock_adjustments"
    }
  ]
}
```

Invalid payloads:

```json
{
  "valid": false,
  "errors": [
    { "code": "invalid_string", "path": ["warehouseId"], "message": "Invalid uuid" },
    { "code": "invalid_enum_value", "path": ["reason"], "message": "Invalid enum value..." }
  ]
}
```

## Adding a new schema

1. Drop `data-schemas/schemas/<group>/<artifact>/v1.json` and `_meta.json`.
2. Add Kafka topic + actions to `_meta.json` labels.
3. Re-run the seeder: `docker compose restart apicurio-seed`
4. Force a registry poll: `curl -X POST http://localhost:3000/admin/reload`
5. New `POST /<group>/<artifact>/v1` is live, Swagger updated.

## Reset

Wipe registry + Kafka state and re-seed:

```bash
docker compose down -v && docker compose up -d --build
```
