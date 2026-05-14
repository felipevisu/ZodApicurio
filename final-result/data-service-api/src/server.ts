import { buildApp } from "./app.js";
import {
  startRegistryPoller,
  syncRegistry,
  waitForRegistry,
} from "./registry.js";

const PORT = process.env.PORT || 3000;

async function main() {
  await waitForRegistry();
  const initial = await syncRegistry();
  console.log(`[registry] initial sync: ${initial.count} schema version(s)`);

  startRegistryPoller();

  buildApp().listen(PORT, () => {
    console.log(`data-service-api listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
