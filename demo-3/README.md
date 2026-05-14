# Demo 3 — Compatibility rules block bad PRs

Same nginx + ngrok pattern as demo-2, but with Apicurio's `BACKWARD` compatibility rule enabled globally. A GitHub Action runs on every PR that touches `demo-3/schemas/**/*.json` and asks Apicurio to dry-run the new version. If the proposed change breaks the rule, the PR check fails — and with branch protection, the merge is blocked.

## What ships out of the box

On `docker compose up`, an init container will:

1. Wait for Apicurio to become reachable.
2. Set the global `COMPATIBILITY` rule to `BACKWARD`.
3. Create group `demo`.
4. Publish `schemas/user.json` as version 1 of artifact `user` in group `demo`.

So after startup you immediately have a baseline against which PRs are validated.

## Architecture

```
        ┌──────────── ngrok (public URL) ────────────┐
        │                                            │
              host :38080 (registry)   host :38888 (UI)
                            │                  │
                ┌───────────▼──────────────────▼───┐
                │ nginx: read = anon               │
                │       write = token              │
                └─────┬─────────────┬──────────────┘
                /apis/*           /*
                      │             │
                apicurio-registry  apicurio-ui
                      │
                postgres (volume)

        apicurio-init (one-shot) ─► seeds rule, group, schemas
```

Network: `demo-3`. nginx exposes registry on `:38080` and UI on `:38888`.

Open UI in browser: <http://localhost:38888>

## Quick start

```bash
cd demo-3
cp .env.example .env                    # set WRITE_TOKEN
docker compose up -d                    # init runs automatically
docker logs -f demo3-apicurio-init      # watch bootstrap output
ngrok http 38080
```

Verify baseline:
```bash
curl -s http://localhost:38080/apis/registry/v3/groups/demo/artifacts | jq
# → should list "user"

curl -s http://localhost:38080/apis/registry/v3/admin/rules/COMPATIBILITY
# → { "ruleType": "COMPATIBILITY", "config": "BACKWARD" }
```

## How the PR gate works

`.github/workflows/demo-3-validate.yml` runs on pull requests targeting `main` when files under `demo-3/schemas/**/*.json` change. For each changed file it calls:

```
POST {APICURIO_URL}/apis/registry/v3/groups/demo/artifacts
     ?ifExists=CREATE_VERSION&dryRun=true
```

- 200 → compatible → check passes
- 409 → rule violation → check fails (PR cannot merge with branch protection)

`.github/workflows/demo-3-publish.yml` runs on push to `main` (i.e. after the PR merges) and does the real publish (no `dryRun`).

## GitHub repo configuration

**Secrets**

| Name | Value |
|---|---|
| `APICURIO_URL_DEMO3` | Public ngrok URL, e.g. `https://abc.ngrok-free.app` |
| `APICURIO_WRITE_TOKEN_DEMO3` | Same string as `WRITE_TOKEN` in `demo-3/.env` |

**Variables** (optional)

| Name | Value |
|---|---|
| `APICURIO_GROUP_ID_DEMO3` | Defaults to `demo` |

**Branch protection** on `main`:
- Require status check `demo-3 — validate schema compatibility (PR gate) / validate`
- Require PR before merging

## Try it — make an incompatible change

Baseline `user.json` requires `id` and `email`. Under `BACKWARD`, adding a *new required* field or removing a required field breaks compatibility.

### Will pass (BACKWARD compatible)
Add an optional field:
```json
"nickname": { "type": "string" }
```

### Will fail
Add a new required field:
```json
"phone": { "type": "string", "format": "phone" }
// and add "phone" to "required"
```
or remove `"email"` from `"required"`.

Push the change as a PR — the workflow runs `validate-schema.sh`, Apicurio returns 409, the check fails, merge is blocked.

## Compatibility levels

Set via `COMPAT_LEVEL` env on the `apicurio-init` service in `docker-compose.yml`:

| Level | Allows |
|---|---|
| `NONE` | Anything |
| `BACKWARD` | New consumers can read old data — add optional fields |
| `BACKWARD_TRANSITIVE` | Backward against every prior version |
| `FORWARD` | Old consumers can read new data |
| `FORWARD_TRANSITIVE` | Forward against every prior version |
| `FULL` | Backward + forward |
| `FULL_TRANSITIVE` | Strictest |

Change `COMPAT_LEVEL`, then `docker compose up -d --force-recreate apicurio-init` to re-apply.

## Layout

```
.github/workflows/
├── demo-3-validate.yml          ← PR gate
└── demo-3-publish.yml           ← runs after merge
demo-3/
├── docker-compose.yml
├── .env.example
├── nginx/nginx.conf
├── schemas/user.json            ← seeded as v1 on startup
└── scripts/
    ├── init.sh                  ← runs in apicurio-init container
    ├── setup-rules.sh           ← optional manual rule setup
    ├── validate-schema.sh       ← dry-run, used by PR workflow
    └── publish-schema.sh        ← real publish, used by merge workflow
```
