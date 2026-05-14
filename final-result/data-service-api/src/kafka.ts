import { Kafka, Producer, logLevel } from "kafkajs";

const BROKERS = (process.env.KAFKA_BROKERS || "kafka:9092").split(",");

let producer: Producer | null = null;
let connecting: Promise<Producer> | null = null;

async function getProducer(): Promise<Producer> {
  if (producer) return producer;
  if (connecting) return connecting;

  const kafka = new Kafka({
    clientId: "zod-data-service",
    brokers: BROKERS,
    logLevel: logLevel.WARN,
  });

  const p = kafka.producer({ allowAutoTopicCreation: true });
  connecting = p.connect().then(() => {
    producer = p;
    connecting = null;
    return p;
  });

  return connecting;
}

export async function sendToKafka(topic: string, payload: unknown) {
  const p = await getProducer();
  const [record] = await p.send({
    topic,
    messages: [
      {
        value: JSON.stringify(payload),
        timestamp: Date.now().toString(),
      },
    ],
  });
  return {
    partition: record.partition,
    baseOffset: record.baseOffset,
  };
}

export async function shutdownKafka() {
  if (producer) await producer.disconnect();
}
