import type { QaConfig } from "./types.js";

const REQUIRED_ENV = "staging";
const REQUIRED_SUPABASE_REF = "vnuowugruqheakomdtuh";
const REQUIRED_SUPABASE_HOST = `db.${REQUIRED_SUPABASE_REF}.supabase.co`;
const REQUIRED_SUPABASE_POOLER_HOST = "aws-1-eu-west-1.pooler.supabase.com";
const REQUIRED_SUPABASE_POOLER_USER = `postgres.${REQUIRED_SUPABASE_REF}`;
const DEFAULT_ALLOWED_API_HOSTS = ["vaipizza-api-staging.onrender.com"];
const MUTATION_CONFIRMATION = "VAIPIZZA_STAGING_ONLY";

function normalizeAllowedHosts(raw?: string) {
  if (!raw) return [...DEFAULT_ALLOWED_API_HOSTS];
  const hosts = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ALLOWED_API_HOSTS, ...hosts]));
}

function parseDatabaseTarget(databaseUrl?: string) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for QA safety checks");
  try {
    const parsed = new URL(databaseUrl);
    return {
      hostname: parsed.hostname.toLowerCase(),
      username: decodeURIComponent(parsed.username),
      port: parsed.port,
      databaseName: parsed.pathname.replace(/^\//, ""),
    };
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }
}

export function loadQaConfig(env: NodeJS.ProcessEnv): QaConfig {
  const apiUrlRaw = env.QA_API_URL;
  if (!apiUrlRaw) throw new Error("QA_API_URL is required");

  let apiUrl: URL;
  try {
    apiUrl = new URL(apiUrlRaw);
  } catch {
    throw new Error("QA_API_URL is invalid");
  }

  const database = parseDatabaseTarget(env.DATABASE_URL);

  return {
    environment: env.QA_ENV ?? "",
    apiUrl: apiUrl.toString().replace(/\/$/, ""),
    apiHostname: apiUrl.hostname.toLowerCase(),
    allowedApiHosts: normalizeAllowedHosts(env.QA_ALLOWED_API_HOSTS),
    databaseHostname: database.hostname,
    databaseUsername: database.username,
    databasePort: database.port,
    databaseName: database.databaseName,
    supabaseProjectRef: REQUIRED_SUPABASE_REF,
    mutationConfirmation: env.QA_CONFIRM,
  };
}

export function assertSafeTarget(config: QaConfig): void {
  if (config.environment !== REQUIRED_ENV) {
    throw new Error(`QA runner only accepts QA_ENV=${REQUIRED_ENV}`);
  }

  const parsedApi = new URL(config.apiUrl);
  if (parsedApi.protocol !== "https:") {
    throw new Error("QA staging API must use HTTPS");
  }
  if (!config.apiHostname.includes("staging")) {
    throw new Error("QA target must be an explicit staging API host");
  }
  if (!config.allowedApiHosts.includes(config.apiHostname)) {
    throw new Error(`QA API host is not allowlisted: ${config.apiHostname}`);
  }

  const directMatch = config.databaseHostname === REQUIRED_SUPABASE_HOST;
  const poolerMatch =
    config.databaseHostname === REQUIRED_SUPABASE_POOLER_HOST &&
    config.databaseUsername === REQUIRED_SUPABASE_POOLER_USER &&
    config.databasePort === "6543";

  if (!directMatch && !poolerMatch) {
    throw new Error("Supabase target is not the approved staging project");
  }
  if (config.databaseName !== "postgres") {
    throw new Error("Supabase database must be postgres");
  }
}

export function assertMutationConfirmation(config: QaConfig): void {
  assertSafeTarget(config);
  if (config.mutationConfirmation !== MUTATION_CONFIRMATION) {
    throw new Error(`Mutating QA commands require QA_CONFIRM=${MUTATION_CONFIRMATION}`);
  }
}

export const QA_SAFETY_CONSTANTS = Object.freeze({
  requiredEnvironment: REQUIRED_ENV,
  requiredSupabaseHost: REQUIRED_SUPABASE_HOST,
  requiredSupabasePoolerHost: REQUIRED_SUPABASE_POOLER_HOST,
  requiredSupabaseRef: REQUIRED_SUPABASE_REF,
  defaultAllowedApiHosts: [...DEFAULT_ALLOWED_API_HOSTS],
  mutationConfirmation: MUTATION_CONFIRMATION,
});
