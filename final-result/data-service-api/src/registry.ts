import { z } from "zod";
import { jsonSchemaToZod } from "json-schema-to-zod";
import type {
  PipelineAction,
  PipelineConfig,
  SchemaEntry,
} from "./types.js";

const REGISTRY_URL = process.env.REGISTRY_URL || "http://localhost:8080";
const API = `${REGISTRY_URL}/apis/registry/v3`;
const POLL_INTERVAL_MS = Number(process.env.REGISTRY_POLL_MS || 30_000);

const cache = new Map<string, SchemaEntry>();
let openApiSpec: object = baseOpenApiSpec();
let lastSyncAt = 0;
let lastSyncError: string | null = null;

function key(groupId: string, artifactId: string, version: string) {
  return `${groupId}/${artifactId}/v${version}`;
}

function baseOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Data Service API",
      description:
        "Validates payloads against JSON Schemas from Apicurio Registry using Zod",
      version: "1.0.0",
    },
    paths: {} as Record<string, unknown>,
  };
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return res.json();
}

function parsePipelineLabels(
  labels: Record<string, string>,
): PipelineConfig {
  const actionNames = (labels["pipeline.actions"] || "")
    .split(",")
    .filter(Boolean);

  const actions = actionNames.map((type) => {
    const prefix = `pipeline.${type}.`;
    const config: PipelineAction = { type };
    for (const [k, v] of Object.entries(labels)) {
      if (k.startsWith(prefix)) {
        config[k.slice(prefix.length)] = v;
      }
    }
    return config;
  });

  return { actions };
}

function compileZod(jsonSchema: Record<string, unknown>) {
  let expr = jsonSchemaToZod(jsonSchema);
  // json-schema-to-zod emits `.unique()` for `uniqueItems`, which Zod does not provide.
  // Translate to a refine that enforces the same constraint.
  expr = expr.replace(
    /\.unique\(\)/g,
    `.refine((arr) => Array.isArray(arr) && new Set(arr.map((x) => JSON.stringify(x))).size === arr.length, { message: "uniqueItems" })`,
  );
  return new Function("z", `return ${expr};`)(z);
}

function buildValidationResponse(valid: boolean) {
  return {
    description: valid ? "Payload is valid" : "Validation failed",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: valid
            ? {
                valid: { type: "boolean", example: true },
                data: { type: "object" },
                pipeline: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      status: { type: "string" },
                      destination: { type: "string" },
                    },
                  },
                },
              }
            : {
                valid: { type: "boolean", example: false },
                errors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      code: { type: "string" },
                      path: { type: "array", items: { type: "string" } },
                      message: { type: "string" },
                    },
                  },
                },
              },
        },
      },
    },
  };
}

function buildOpenApiSpec(entries: SchemaEntry[]) {
  const spec = baseOpenApiSpec() as ReturnType<typeof baseOpenApiSpec>;
  for (const e of entries) {
    const { $id, ...requestSchema } = e.jsonSchema as Record<string, unknown>;
    spec.paths[`/${e.groupId}/${e.artifactId}/v${e.version}`] = {
      post: {
        tags: [e.groupId],
        summary: `Send ${e.artifactId} v${e.version}`,
        operationId: `send_${e.groupId}_${e.artifactId}_v${e.version}`.replace(
          /-/g,
          "_",
        ),
        requestBody: {
          required: true,
          content: { "application/json": { schema: requestSchema } },
        },
        responses: {
          "200": buildValidationResponse(true),
          "400": buildValidationResponse(false),
          "404": {
            description: "Schema not found in registry",
          },
        },
      },
    };
  }
  return spec;
}

async function discoverSchemas(): Promise<SchemaEntry[]> {
  const { groups } = await fetchJson(`${API}/groups`);

  const nested = await Promise.all(
    groups.map(async (group: { groupId: string }) => {
      const { artifacts } = await fetchJson(
        `${API}/groups/${group.groupId}/artifacts`,
      );
      return Promise.all(
        artifacts.map(async (artifact: { artifactId: string }) => {
          const [{ versions }, artifactMeta] = await Promise.all([
            fetchJson(
              `${API}/groups/${group.groupId}/artifacts/${artifact.artifactId}/versions`,
            ),
            fetchJson(
              `${API}/groups/${group.groupId}/artifacts/${artifact.artifactId}`,
            ),
          ]);
          const pipeline = parsePipelineLabels(artifactMeta.labels || {});

          return Promise.all(
            versions.map(async (ver: { version: string; modifiedOn?: string }) => {
              const jsonSchema = await fetchJson(
                `${API}/groups/${group.groupId}/artifacts/${artifact.artifactId}/versions/${ver.version}/content`,
              );
              return {
                groupId: group.groupId,
                artifactId: artifact.artifactId,
                version: ver.version,
                jsonSchema,
                schema: compileZod(jsonSchema),
                pipeline,
                modifiedOn: ver.modifiedOn,
              } satisfies SchemaEntry;
            }),
          );
        }),
      );
    }),
  );

  return nested.flat(2);
}

export async function syncRegistry(): Promise<{
  count: number;
  added: string[];
  updated: string[];
  removed: string[];
}> {
  const fresh = await discoverSchemas();
  const freshKeys = new Set(
    fresh.map((e) => key(e.groupId, e.artifactId, e.version)),
  );

  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];

  for (const e of fresh) {
    const k = key(e.groupId, e.artifactId, e.version);
    const prev = cache.get(k);
    if (!prev) {
      added.push(k);
    } else if (prev.modifiedOn !== e.modifiedOn) {
      updated.push(k);
    }
    cache.set(k, e);
  }

  for (const k of cache.keys()) {
    if (!freshKeys.has(k)) {
      cache.delete(k);
      removed.push(k);
    }
  }

  openApiSpec = buildOpenApiSpec(Array.from(cache.values()));
  lastSyncAt = Date.now();
  lastSyncError = null;

  return { count: cache.size, added, updated, removed };
}

export function startRegistryPoller() {
  setInterval(async () => {
    try {
      const r = await syncRegistry();
      if (r.added.length || r.updated.length || r.removed.length) {
        console.log(
          `[registry] sync: +${r.added.length} ~${r.updated.length} -${r.removed.length} (total ${r.count})`,
        );
      }
    } catch (err) {
      lastSyncError = err instanceof Error ? err.message : String(err);
      console.error(`[registry] sync failed: ${lastSyncError}`);
    }
  }, POLL_INTERVAL_MS);
}

export function getEntry(groupId: string, artifactId: string, version: string) {
  return cache.get(key(groupId, artifactId, version));
}

export function listEntries(): SchemaEntry[] {
  return Array.from(cache.values());
}

export function getOpenApiSpec() {
  return openApiSpec;
}

export function getStatus() {
  return {
    count: cache.size,
    lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    lastSyncError,
    pollIntervalMs: POLL_INTERVAL_MS,
    registryUrl: REGISTRY_URL,
  };
}

export async function waitForRegistry(retries = 30, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await fetchJson(`${API}/system/info`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `Registry not reachable at ${REGISTRY_URL} after ${retries} attempts`,
  );
}
