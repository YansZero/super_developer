import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { createApp } from "./app.js";
import { loadConfiguration } from "./config.js";
import { createDatabase } from "./storage/database.js";
// This entry point alone reads process configuration and creates production resources.
const configuration = loadConfiguration(process.env);
const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const dbPath = resolve(projectRoot, configuration.config?.databasePath ?? "./backend/data/super-developer.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });
const database = createDatabase(dbPath);
const app = createApp({ configuration, database, transport: fetch });
const server = app.listen(configuration.port, "127.0.0.1", () =>
  console.info(`Jira BFF listening on port ${configuration.port}`),
);
server.on("error", (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Jira BFF startup failed: ${message}`);
  database?.close();
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      database?.close();
      process.exit();
    }),
  );
