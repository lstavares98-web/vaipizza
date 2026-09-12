import "dotenv/config";
import { createServer } from "node:http";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";

if (env.NODE_ENV !== "test") {
  throw new Error("Local QA candidate server only runs with NODE_ENV=test");
}

const server = createServer(createApp());
server.listen(env.PORT, "127.0.0.1", () => {
  console.log(`VAIPIZZA local QA candidate API listening on 127.0.0.1:${env.PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
