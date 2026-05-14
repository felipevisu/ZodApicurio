import type { PipelineAction, PipelineConfig } from "./types.js";
import { sendToKafka } from "./kafka.js";

export interface ActionResult {
  type: string;
  status: "sent" | "persisted" | "error";
  destination: string;
  error?: string;
  partition?: number;
  offset?: string;
}

type ActionHandler = (
  action: PipelineAction,
  data: unknown,
) => Promise<ActionResult>;

const handlers: Record<string, ActionHandler> = {
  async kafka(action, data) {
    const topic = action.topic;
    if (!topic) {
      return { type: "kafka", status: "error", destination: "?", error: "missing pipeline.kafka.topic label" };
    }
    const { partition, baseOffset } = await sendToKafka(topic, data);
    return {
      type: "kafka",
      status: "sent",
      destination: topic,
      partition,
      offset: baseOffset,
    };
  },

  async database(action, data) {
    // Database persistence still stubbed — real demo uses Kafka.
    return {
      type: "database",
      status: "persisted",
      destination: action.table || "?",
    };
  },
};

export async function executePipeline(
  pipeline: PipelineConfig,
  data: unknown,
): Promise<ActionResult[]> {
  const results = await Promise.all(
    pipeline.actions.map(async (action) => {
      const handler = handlers[action.type];

      if (!handler) {
        return {
          type: action.type,
          status: "error" as const,
          destination: "unknown",
          error: `No handler for action type: ${action.type}`,
        };
      }

      try {
        return await handler(action, data);
      } catch (err) {
        return {
          type: action.type,
          status: "error" as const,
          destination: "unknown",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return results;
}
