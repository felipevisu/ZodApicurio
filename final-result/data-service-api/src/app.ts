import cors from "cors";
import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";
import { executePipeline } from "./pipeline.js";
import {
  getEntry,
  getOpenApiSpec,
  getStatus,
  listEntries,
  syncRegistry,
} from "./registry.js";

export function buildApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(undefined, { swaggerUrl: "/openapi.json" }),
  );

  app.get("/openapi.json", (_req, res) => {
    res.json(getOpenApiSpec());
  });

  app.get("/status", (_req, res) => {
    res.json(getStatus());
  });

  app.post("/admin/reload", async (_req, res) => {
    try {
      const r = await syncRegistry();
      res.json({ ok: true, ...r });
    } catch (err) {
      res
        .status(500)
        .json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/", (_req, res) => {
    res.json({
      service: "data-service-api",
      docs: "/docs",
      openapi: "/openapi.json",
      status: "/status",
      reload: "POST /admin/reload",
      endpoints: listEntries().map((s) => ({
        method: "POST",
        path: `/${s.groupId}/${s.artifactId}/v${s.version}`,
        pipeline: s.pipeline,
      })),
    });
  });

  app.post("/:groupId/:artifactId/v:version", async (req, res) => {
    const { groupId, artifactId, version } = req.params;
    const entry = getEntry(groupId, artifactId, version);

    if (!entry) {
      res.status(404).json({
        valid: false,
        error: `No schema registered for ${groupId}/${artifactId} v${version}`,
      });
      return;
    }

    const result = entry.schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        valid: false,
        errors: result.error.issues,
      });
      return;
    }

    const pipelineResults = await executePipeline(entry.pipeline, result.data);

    res.json({
      valid: true,
      data: result.data,
      pipeline: pipelineResults,
    });
  });

  return app;
}
