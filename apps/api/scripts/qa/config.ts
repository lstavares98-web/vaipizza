import type { QaConfig } from "./types.js";

const REQUIRED_ENV = "staging";
const REQUIRED_SUPABASE_HOST = "db.vnuowugruqheakomdtuh.supabase.co";
const REQUIRED_SUPABASE_REF = "vnuowugruqheakomdtuh";
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

function parseDatabaseHostname(databaseUrl?: string) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for QA safety checks");
  try {
    return new URL(databaseUrl).hostname.toLowerCase();
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

  return {
    environment: env.QA_ENV ?? "",
    apiUrl: apiUrl.toString().replace(/\/$/, ""),
    apiHostname: apiUrl.hostname.toLowerCase(),
    allowedApiHosts: normalizeAllowedHosts(env.QA_ALLOWED_API_HOSTS),
    databaseHostname: parseDatabaseHostname(env.DATABASE_URL),
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

  if (config.databaseHostname !== REQUIRED_SUPABASE_HOST) {
    throw new Error(`Supabase target is not the approved staging project: ${config.databaseHostname}`);
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
  requiredSupabaseRef: REQUIRED_SUPABASE_REF,
  defaultAllowedApiHosts: [...DEFAULT_ALLOWED_API_HOSTS],
  mutationConfirmation: MUTATION_CONFIRMATION,
});
