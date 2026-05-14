import { jsonSchemaToZod } from "json-schema-to-zod";
import { readFileSync } from "node:fs";
import { z } from "zod";

const jsonSchema = JSON.parse(
  readFileSync(new URL("../input-schemas/user.json", import.meta.url), "utf8"),
);

// Convert at runtime, evaluate the generated source into a real schema.
// In production code prefer the CLI: compile-time generation gives static types.
const tsSource = jsonSchemaToZod(jsonSchema);
const User = new Function("z", `return ${tsSource};`)(z) as z.ZodTypeAny;

const good = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  email: "a@b.com",
  displayName: "Alice",
};

const bad = {
  id: "not-a-uuid",
  email: "definitely-not-an-email",
};

console.log("Good:", User.safeParse(good));
console.log();
const r = User.safeParse(bad);
if (!r.success) {
  console.log("Bad — issues:");
  for (const i of r.error.issues) console.log(`  ${i.path.join(".")}: ${i.message}`);
}
