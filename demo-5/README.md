# Demo 5 — JSON Schema → Zod

`json-schema-to-zod` converts JSON Schema documents into Zod schemas. Two flavors:
- **CLI** — run once at build time, commit the generated `.ts` next to your code.
- **Programmatic** — call `jsonSchemaToZod(schema)` at runtime; great for fetching schemas from a registry.

The pitch: keep the *contract* in JSON Schema (registry-friendly, language-agnostic) but use Zod inside each TypeScript service.

## Run

```bash
cd demo-5
npm install

npm run demo:cli   # CLI: convert input-schemas/user.json → output-schemas/user.generated.ts
npm run demo:01    # Programmatic: print generated TS source for the same schema
npm run demo:02    # Build a Zod schema in-process, validate good + bad payloads
npm run demo:03    # Fetch live schema from Apicurio (demo-3), convert, validate
```

## Sample workflows

### CLI — recommended for production

```bash
npx json-schema-to-zod -i input-schemas/user.json -o output-schemas/user.generated.ts
```

You get a hand-readable, fully typed `.ts` file with a default-exported Zod schema. Commit it, import it, get static types for free.

### Programmatic — runtime conversion

```ts
import { jsonSchemaToZod } from "json-schema-to-zod";
import { z } from "zod";

const tsSource = jsonSchemaToZod(jsonSchemaObject, { module: "cjs" });
const Schema = new Function("z", `${tsSource}; return module.exports;`)(z) as z.ZodTypeAny;
Schema.parse(payload);
```

Use this when schemas come from a registry at startup or rotate frequently.

### From Apicurio

`demo:03` fetches `groups/demo/artifacts/user@latest` from `$APICURIO_URL` (default `http://localhost:38080`), converts, and validates. Override via env:

```bash
APICURIO_URL=https://abc.ngrok-free.app GROUP_ID=demo ARTIFACT_ID=user npm run demo:03
```

Pair this with demo-3's CI gate and you get the full loop:
1. Schema author opens PR → BACKWARD check runs → bad change blocked.
2. Merged schema lands in Apicurio.
3. Each consumer service pulls the schema, converts to Zod, validates incoming events at the boundary.

## Caveats

| What | Note |
|---|---|
| JSON Schema draft | The converter and Apicurio both work best with **draft-04/06/07**. Avoid 2020-12. |
| `format` semantics | Zod has built-in `email`, `uuid`, `url`, etc. Unknown formats become no-ops. |
| Refs (`$ref`) | Supported for in-document refs; external refs need pre-bundling. |
| Discriminated unions | JSON Schema doesn't express them well; `oneOf` becomes a plain Zod union, not `z.discriminatedUnion`. Hand-edit if you need narrowing. |

## File layout

```
demo-5/
├── package.json
├── tsconfig.json
├── input-schemas/
│   └── user.json
├── output-schemas/
│   └── user.generated.ts        (created by `npm run demo:cli`)
└── examples/
    ├── 01-programmatic.ts        print generated TS source
    ├── 02-validate-runtime.ts    eval generated source, validate payloads
    └── 03-from-apicurio.ts       fetch schema from registry → Zod → validate
```
