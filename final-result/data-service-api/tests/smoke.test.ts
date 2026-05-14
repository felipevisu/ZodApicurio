import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildApp } from "../src/app.js";
import { syncRegistry, waitForRegistry, listEntries } from "../src/registry.js";

let app: Express;

beforeAll(async () => {
  await waitForRegistry();
  await syncRegistry();
  app = buildApp();
}, 60_000);

describe("data-service-api smoke", () => {
  it("GET / lists endpoints", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.endpoints)).toBe(true);
  });

  it("GET /openapi.json has paths", async () => {
    const res = await request(app).get("/openapi.json");
    expect(res.status).toBe(200);
    expect(typeof res.body.paths).toBe("object");
  });

  it("GET /status reports cache count", async () => {
    const res = await request(app).get("/status");
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it("POST unknown route returns 404 with valid:false", async () => {
    const res = await request(app)
      .post("/__nope__/__nada__/v1")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.valid).toBe(false);
  });

  it("POST with empty body to first registered route returns 400 if required fields exist", async () => {
    const entries = listEntries();
    expect(entries.length).toBeGreaterThan(0);

    const e = entries[0];
    const route = `/${e.groupId}/${e.artifactId}/v${e.version}`;
    const res = await request(app).post(route).send({});

    const required = (e.jsonSchema.required as string[] | undefined) ?? [];
    if (required.length > 0) {
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(Array.isArray(res.body.errors)).toBe(true);
    } else {
      expect([200, 400]).toContain(res.status);
    }
  });

  it("POST /admin/reload re-syncs registry", async () => {
    const res = await request(app).post("/admin/reload");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });
});
