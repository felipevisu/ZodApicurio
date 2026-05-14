import { z } from "zod";

// 1. Define a schema. Once. It's both a validator and a TS type.
const User = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0),
  role: z.enum(["admin", "user"]),
});

// 2. Get the TS type for free — no duplication.
type User = z.infer<typeof User>;

// 3. Validate good data — returns typed object.
const good = User.parse({
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  email: "a@b.com",
  age: 30,
  role: "admin",
});
console.log("OK:", good);

// 4. Validate bad data — safeParse returns { success, error } instead of throwing.
const result = User.safeParse({
  id: "not-a-uuid",
  email: "not-an-email",
  age: -1,
  role: "guest",
});

if (!result.success) {
  console.log("\nIssues:");
  for (const issue of result.error.issues) {
    console.log(`  ${issue.path.join(".")}: ${issue.message}`);
  }
}
