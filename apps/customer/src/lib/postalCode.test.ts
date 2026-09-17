import { describe, expect, it } from "vitest";
import { formatPortuguesePostalCode, isPortuguesePostalCode } from "./postalCode";

describe("Portuguese postal code", () => {
  it("inserts the hyphen after the first four digits", () => {
    expect(formatPortuguesePostalCode("4700329")).toBe("4700-329");
    expect(formatPortuguesePostalCode("4700-329")).toBe("4700-329");
  });

  it("accepts only the 0000-000 format", () => {
    expect(isPortuguesePostalCode("4700-329")).toBe(true);
    expect(isPortuguesePostalCode("4700329")).toBe(false);
    expect(isPortuguesePostalCode("4700-32")).toBe(false);
  });
});
