import { jsonSchemaToZod } from "json-schema-to-zod";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const jsonSchema = JSON.parse(
  readFileSync(new URL("../input-schemas/user.json", import.meta.url), "utf8"),
);

const tsSource = jsonSchemaToZod(jsonSchema, { module: "esm", name: "User" });

const outputUrl = new URL("../output-schemas/user.generated.ts", import.meta.url);
const outputPath = fileURLToPath(outputUrl);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, tsSource);

console.log("Generated TypeScript source:\n");
console.log(tsSource);
console.log(`\nWrote ${outputPath}`);
