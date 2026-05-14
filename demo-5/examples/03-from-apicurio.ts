// Fetch the latest version of a JSON Schema artifact from an Apicurio Registry
// (e.g. the demo-3 stack on http://localhost:38080), convert it to a Zod schema,
// then validate sample payloads against it.

import { jsonSchemaToZod } from "json-schema-to-zod";
import { z } from "zod";

const APICURIO_URL = process.env.APICURIO_URL ?? "http://localhost:38080";
const GROUP_ID = process.env.GROUP_ID ?? "demo";
const ARTIFACT_ID = process.env.ARTIFACT_ID ?? "user";

const url = `${APICURIO_URL}/apis/registry/v3/groups/${GROUP_ID}/artifacts/${ARTIFACT_ID}/versions/branch=latest/content`;

console.log(`Fetching ${url}`);

const res = await fetch(url, {
  headers: { Accept: "application/json", "ngrok-skip-browser-warning": "true" },
});
if (!res.ok) {
  console.error(`Apicurio returned ${res.status} ${res.statusText}`);
  process.exit(1);
}
const jsonSchema = await res.json();
console.log("\nFetched schema:");
console.log(JSON.stringify(jsonSchema, null, 2));

const tsSource = jsonSchemaToZod(jsonSchema, { module: "none" });
const Schema = new Function("z", `return ${tsSource};`)(z) as z.ZodTypeAny;

const sample = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  email: "a@b.com",
  displayName: "Alice",
};

console.log("\nValidating sample:", sample);
const result = Schema.safeParse(sample);
console.log(result.success ? "OK" : "FAIL", result);
