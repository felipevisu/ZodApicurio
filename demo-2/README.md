# Demo 2 — Public read-only Apicurio with CI-driven publishing

A single ngrok-exposed Apicurio Registry that the public can browse but only GitHub Actions can write to. Reads are anonymous; writes require a shared secret in the `X-Auth-Token` header. nginx in front of Apicurio enforces this.

## Architecture

```
        ┌──────────────────────────────────────────────────────┐
        │                  ngrok (public URL)                  │
        └───────────────────────────┬──────────────────────────┘
                                    │
                  host :28080 (registry)   host :28888 (UI)
                                    │             │
        ┌───────────────────────────▼─────────────▼────────────┐
        │  nginx  —  GET/HEAD/OPTIONS: anonymous OK            │
        │            POST/PUT/PATCH/DELETE: X-Auth-Token req.  │
        └─────────┬───────────────────────────┬────────────────┘
                  │ /apis/*                   │ /*
                  ▼                           ▼
           apicurio-registry              apicurio-ui
                  │
                  └──► postgres (volume, data persists)
```

Network: `demo-2`. nginx exposes registry on `:28080` and UI on `:28888`.

Open UI in browser: <http://localhost:28888>

## Setup

1. **Create the write secret**

   ```bash
   cp .env.example .env
   # edit .env and replace WRITE_TOKEN with: openssl rand -hex 32
   ```

2. **Start the stack**

   ```bash
   docker compose up -d
   ```

3. **Expose with ngrok**

   ```bash
   ngrok http 28080
   ```

   Note the `https://xxxx.ngrok-free.app` URL.

4. **Verify read-only**

   ```bash
   # Anonymous read: 200
   curl -i https://xxxx.ngrok-free.app/apis/registry/v3/system/info

   # Anonymous write: 403
   curl -i -X POST https://xxxx.ngrok-free.app/apis/registry/v3/groups/default/artifacts

   # Write with token: 200
   curl -i -X POST -H "X-Auth-Token: $WRITE_TOKEN" \
     https://xxxx.ngrok-free.app/apis/registry/v3/groups/default/artifacts
   ```

## GitHub Action setup

On the GitHub repository hosting this demo, configure:

**Secrets** (Settings → Secrets and variables → Actions → Secrets)

- `APICURIO_URL` — your public ngrok URL (e.g. `https://xxxx.ngrok-free.app`)
- `APICURIO_WRITE_TOKEN` — same value as `WRITE_TOKEN` in `.env`

**Variables** (optional)

- `APICURIO_GROUP_ID` — target group, defaults to `default`

The workflow lives at the repo root: `.github/workflows/demo-2-publish-schemas.yml`. It runs on push to `main` (or manual dispatch) when files are added under `demo-2/schemas/**/*.json` and publishes them via `demo-2/scripts/publish-schema.sh`.

> Default behavior publishes **new files only** (`--diff-filter=A`). To also republish modified schemas as new versions, change the filter to `AM` in the workflow.

> ngrok free URLs change on every restart. Update `APICURIO_URL` secret each time, or use a reserved/paid ngrok domain.

## Local publish (manual test)

```bash
export APICURIO_URL=http://localhost:28080
export WRITE_TOKEN=$(grep WRITE_TOKEN .env | cut -d= -f2)
export GROUP_ID=default

./scripts/publish-schema.sh schemas/product.json
```

## Layout

```
.github/workflows/demo-2-publish-schemas.yml   ← workflow lives at repo root
demo-2/
├── docker-compose.yml
├── .env.example
├── nginx/nginx.conf
├── schemas/product.json
└── scripts/publish-schema.sh
```

## Security notes

- `WRITE_TOKEN` is a shared bearer-style secret. Anyone holding it can publish. Treat like a password.
- ngrok URLs are public — anything Apicurio exposes via `/apis/*` GET is world-readable.
- For real use, swap nginx token-check for OIDC/mTLS or use Apicurio's built-in auth.
