// Local dev Postgres via embedded-postgres (no Docker/brew needed).
// Usage:
//   node scripts/pg.mjs start   # initialize + start on :5432, then stays up
//   node scripts/pg.mjs stop
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "viral",
  password: "viral",
  port: 5432,
  persistent: true,
});

const cmd = process.argv[2] ?? "start";

if (cmd === "start") {
  if (!existsSync(dataDir)) {
    console.log("Initializing Postgres cluster...");
    await pg.initialise();
  }
  await pg.start();
  // Ensure the app database exists.
  try {
    await pg.createDatabase("viral_invoice");
    console.log("Created database viral_invoice");
  } catch {
    console.log("Database viral_invoice already exists");
  }
  console.log("Postgres up on postgres://viral:viral@localhost:5432/viral_invoice");
  console.log("(leave this running; Ctrl+C to stop)");
  // Keep the process alive.
  await new Promise(() => {});
} else if (cmd === "stop") {
  await pg.stop();
  console.log("Postgres stopped");
} else {
  console.error("Unknown command:", cmd);
  process.exit(1);
}
