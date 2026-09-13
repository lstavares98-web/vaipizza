import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const HEADER_FILES = [
  ["customer", resolve(process.cwd(), "public/_headers")],
  ["restaurant", resolve(process.cwd(), "../restaurant/public/_headers")],
  ["kds", resolve(process.cwd(), "../kds/public/_headers")],
  ["courier", resolve(process.cwd(), "../courier/public/_headers")],
] as const;

for (const [surface, file] of HEADER_FILES) {
  test(`${surface} CSP permits its declared Google Fonts stylesheet without weakening scripts`, () => {
    const headers = readFileSync(file, "utf8");
    const csp = headers.split("\n").find((line) => line.includes("Content-Security-Policy:")) ?? "";

    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;");
    expect(csp).toContain("font-src 'self' data: https:");
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });
}
