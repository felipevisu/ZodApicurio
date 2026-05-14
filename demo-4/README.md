# Demo 4 — What is Zod?

Zod is a TypeScript-first schema library. One declaration gives you:
- **runtime validation** with structured errors
- a **static TypeScript type** (`z.infer<typeof Schema>`)

No code generation, no decorators.

## Run

```bash
cd demo-4
npm install
npm run demo
```

## The whole demo in one file

`demo.ts` shows the four things worth saying out loud:

1. Declare a schema with nested constraints (`uuid`, `email`, `min`, `enum`).
2. Get the TS type for free with `z.infer`.
3. `parse` good data → typed object back.
4. `safeParse` bad data → `{ success: false, error }` with one issue per failed field.

That's the 2-minute pitch. Refine/transform/discriminated unions exist; skip them in the intro.
