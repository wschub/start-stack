#!/usr/bin/env node
// `npm create start-stack my-api` ejecuta este archivo con los argumentos ["my-api", ...].
// Es lo mismo que `npx start-stack create my-api`: se antepone el comando y se delega.
process.argv.splice(2, 0, "create");
await import("start-stack/dist/bin.js");
