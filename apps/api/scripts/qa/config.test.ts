import { describe, expect, it } from "vitest";
import { assertMutationConfirmation, assertSafeTarget, loadQaConfig } from "./config.js";

const stagingDb = "postgresql://u:p@db.vnuowugruqheakomdtuh.supabase.co:5432/postgres?sslmode=require";

describe("QA staging guard", () => {
  it("accepts the known staging API and Supabase ref", () => {
    const config = loadQaConfig({
      QA_ENV: "staging",
      QA_API_URL: "https://vaipizza-api-staging.onrender.com",
      DATABASE_URL: stagingDb,
    });
    expect(() => assertSafeTarget(config)).not.toThrow();
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
