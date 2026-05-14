import type { ZodTypeAny } from "zod";

export interface PipelineAction {
  type: string;
  [key: string]: string;
}

export interface PipelineConfig {
  actions: PipelineAction[];
}

export interface SchemaEntry {
  groupId: string;
  artifactId: string;
  version: string;
  jsonSchema: Record<string, unknown>;
  schema: ZodTypeAny;
  pipeline: PipelineConfig;
  modifiedOn?: string;
}
