import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicDir = fileURLToPath(new URL("../../public/", import.meta.url));
const viteConfigPath = fileURLToPath(new URL("../../vite.config.ts", import.meta.url));

function pngSize(filename: string) {
  const buffer = fs.readFileSync(`${publicDir}${filename}`);
  expect(buffer.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("PWA install assets", () => {
  const icons = [
    { filename: "pwa-192x192.png", width: 192, height: 192 },
    { filename: "pwa-512x512.png", width: 512, height: 512 },
    { filename: "pwa-maskable-512x512.png", width: 512, height: 512 },
  ];

  for (const icon of icons) {
    it(`generates ${icon.filename} with the declared dimensions`, () => {
      expect(fs.existsSync(`${publicDir}${icon.filename}`)).toBe(true);
      expect(pngSize(icon.filename)).toEqual({ width: icon.width, height: icon.height });
    });
  }

  it("keeps the manifest icon paths aligned with generated assets", () => {
    const config = fs.readFileSync(viteConfigPath, "utf8");
    for (const icon of icons) expect(config).toContain(`/${icon.filename}`);
    expect(config).not.toContain("/logo.png");
  });
});
