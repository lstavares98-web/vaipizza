import { expect, test, type Page } from "@playwright/test";

const SURFACES = [
  ["customer", "https://vaipizza-cliente-staging.netlify.app"],
  ["restaurant", "https://vaipizza-gestao-staging.netlify.app"],
  ["kds", "https://vaipizza-cozinha-staging.netlify.app"],
] as const;

async function sha256Base64(page: Page, text: string): Promise<string> {
  return page.evaluate(async (value) => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    let binary = "";
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, text);
}

test("reports the effective CSP and inline script hashes for staging surfaces", async ({ page }) => {
  const report: Array<Record<string, unknown>> = [];

  for (const [surface, url] of SURFACES) {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(response, `${surface} should return a document response`).not.toBeNull();

    const csp = response?.headers()["content-security-policy"] ?? null;
    const inventory = await page.evaluate(() => ({
      stylesheets: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((link) => link.href),
      scripts: Array.from(document.scripts).map((script) => ({
        src: script.src || null,
        type: script.type || null,
        text: script.src ? null : (script.textContent ?? ""),
      })),
    }));

    const scripts = [] as Array<Record<string, unknown>>;
    for (const script of inventory.scripts) {
      scripts.push({
        src: script.src,
        type: script.type,
        text: script.text,
        sha256: typeof script.text === "string" && script.text.length > 0
          ? `sha256-${await sha256Base64(page, script.text)}`
          : null,
      });
    }

    report.push({ surface, url, csp, stylesheets: inventory.stylesheets, scripts });
  }

  console.log(`QA_CSP_DIAGNOSTIC=${JSON.stringify(report)}`);
});
