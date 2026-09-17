import { describe, expect, it } from "vitest";
import { getInstallAction } from "./installAppPolicy";

describe("getInstallAction", () => {
  it("hides the action in standalone mode", () => {
    expect(getInstallAction({ standalone: true, ios: false, hasNativePrompt: true })).toBe("hidden");
  });

  it("uses native install when the browser exposes a prompt", () => {
    expect(getInstallAction({ standalone: false, ios: false, hasNativePrompt: true })).toBe("native");
  });

  it("shows the iOS guide when no native prompt exists", () => {
    expect(getInstallAction({ standalone: false, ios: true, hasNativePrompt: false })).toBe("ios-guide");
  });

  it("shows a browser guide instead of disappearing on other browsers", () => {
    expect(getInstallAction({ standalone: false, ios: false, hasNativePrompt: false })).toBe("browser-guide");
  });
});
