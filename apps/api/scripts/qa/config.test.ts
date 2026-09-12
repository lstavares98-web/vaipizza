import { describe, expect, it } from "vitest";
import { assertMutationConfirmation, assertSafeTarget, loadQaConfig } from "./config.js";

const stagingDb = "postgresql://u:p@db.vnuowugruqheakomdtuh.supabase.co:5432/postgres?sslmode=require";
const stagingPoolerDb = "postgresql://postgres.vnuowugruqheakomdtuh:p@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

describe("QA staging guard", () => {
  it("accepts the known staging API and direct Supabase host", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: stagingDb,
    });
    expect(() => assertSafeTarget(config)).not.toThrow();
  });

  it("accepts the approved IPv4 transaction pooler only when the username carries the staging project ref", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: stagingPoolerDb,
    });
    expect(() => assertSafeTarget(config)).not.toThrow();
  });

  it("rejects the pooler when the username points at another project ref", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: "postgresql://postgres.otherproject:p@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    });
    expect(() => assertSafeTarget(config)).toThrow(/Supabase/i);
  });

  it("rejects production-like API hosts", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://api.vaipizza.pt",
      DATABASE_URL: stagingDb,
    });
    expect(() => assertSafeTarget(config)).toThrow(/staging/i);
  });

  it("rejects an unknown Supabase project", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: "postgresql://u:p@db.otherproject.supabase.co:5432/postgres?sslmode=require",
    });
    expect(() => assertSafeTarget(config)).toThrow(/Supabase/i);
  });

  it("rejects a non-staging environment", () => {
    const config = loadQaConfig({
      QA_ENV: "production",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: stagingDb,
    });
    expect(() => assertSafeTarget(config)).toThrow(/staging/i);
  });

  it("requires the exact mutation confirmation token", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: stagingDb,
      QA_CONFIRM: "wrong",
    });
    expect(() => assertMutationConfirmation(config)).toThrow(/VAIPIZZA_STAGING_ONLY/);
  });

  it("accepts the exact mutation confirmation token", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: stagingDb,
      QA_CONFIRM: "VAIPIZZA_STAGING_ONLY",
    });
    expect(() => assertMutationConfirmation(config)).not.toThrow();
  });
});
