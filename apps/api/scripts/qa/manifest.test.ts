import { describe, expect, it } from "vitest";
import type { QaRunManifest } from "./types.js";
import { createEmptyManifest, createRunId, manifestForPersistence, qaCourierEmail, qaEmail, validateManifest } from "./manifest.js";

const config = {
  environment: "staging",
  apiUrl: "https://vaipizza-api-staging.onrender.com",
  apiHostname: "vaipizza-api-staging.onrender.com",
  allowedApiHosts: ["vaipizza-api-staging.onrender.com"],
  databaseHostname: "db.vnuowugruqheakomdtuh.supabase.co",
  databaseUsername: "postgres",
  databasePort: "5432",
  databaseName: "postgres",
  supabaseProjectRef: "vnuowugruqheakomdtuh",
};

describe("QA manifest markers", () => {
  it("creates deterministic run ids in UTC", () => {
    expect(createRunId(new Date("2026-09-11T19:15:00Z"))).toBe("QA-20260911-191500");
  });

  it("creates deterministic customer and courier emails", () => {
    expect(qaEmail("QA-20260911-191500", 3)).toBe("qa+QA-20260911-191500-3@vaipizza.test");
    expect(qaCourierEmail("QA-20260911-191500", 3)).toBe("qa+QA-20260911-191500-courier-3@vaipizza.test");
  });

  it("rejects empty persisted ids", () => {
    const manifest = createEmptyManifest(config, "QA-20260911-191500");
    manifest.orderIds.push("");
    expect(() => validateManifest(manifest)).toThrow(/empty id/i);
  });

  it("tracks QA operator user ids for cleanup", () => {
    const manifest = createEmptyManifest(config, "QA-20260911-191500");
    manifest.operatorUserIds.push("operator-1");
    const persisted = manifestForPersistence(manifest);
    expect(persisted.operatorUserIds).toEqual(["operator-1"]);
  });

  it("persists only the approved manifest fields", () => {
    const manifest = createEmptyManifest(config, "QA-20260911-191500") as QaRunManifest & {
      accessToken?: string;
      password?: string;
    };
    manifest.customerUserIds.push("user-1");
    manifest.accessToken = "secret-token";
    manifest.password = "secret-password";
    const persisted = manifestForPersistence(manifest) as unknown as Record<string, unknown>;
    expect(persisted.customerUserIds).toEqual(["user-1"]);
    expect(persisted).not.toHaveProperty("accessToken");
    expect(persisted).not.toHaveProperty("password");
  });
});
