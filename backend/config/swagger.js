import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let swaggerSpec = null;

try {
  const swaggerPath = path.join(__dirname, "../docs/openapi.yaml");
  swaggerSpec = yaml.load(fs.readFileSync(swaggerPath, "utf8"));
} catch (error) {
  console.error("Failed to load OpenAPI spec:", error.message);
}

export default swaggerSpec;