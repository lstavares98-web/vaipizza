import { describe, expect, it } from "vitest";
import { buildOrderCustomerDisplay } from "./orderCustomerDisplay.js";

describe("buildOrderCustomerDisplay", () => {
  it("keeps registered customer and saved address", () => {
    expect(buildOrderCustomerDisplay({
      user: { name: "Maria", phone: "912345678" },
      address: { line1: "Rua A", city: "Braga", lat: 41.55, lng: -8.42 },
      customerNameSnapshot: "Maria",
      customerPhoneSnapshot: "+351912345678",
      deliveryLine1Snapshot: "Rua A",
      deliveryCitySnapshot: "Braga",
      customerLat: 41.55,
      customerLng: -8.42,
    })).toEqual({
      user: { name: "Maria", phone: "912345678" },
      address: { line1: "Rua A", city: "Braga", lat: 41.55, lng: -8.42 },
    });
  });

  it("builds courier-safe customer and complete address from manual order snapshots", () => {
    expect(buildOrderCustomerDisplay({
      user: null,
      address: null,
      customerNameSnapshot: "João",
      customerPhoneSnapshot: "+351913333333",
      deliveryLine1Snapshot: "Rua B, 10",
      deliveryLine2Snapshot: "3.º esquerdo",
      deliveryCitySnapshot: "Braga",
      deliveryPostalCodeSnapshot: "4700-000",
      customerLat: 41.56,
      customerLng: -8.41,
    } as any)).toEqual({
      user: { name: "João", phone: "+351913333333" },
      address: {
        line1: "Rua B, 10",
        line2: "3.º esquerdo",
        city: "Braga",
        postalCode: "4700-000",
        lat: 41.56,
        lng: -8.41,
      },
    });
  });

  it("keeps pickup orders without an address safe", () => {
    expect(buildOrderCustomerDisplay({
      user: null,
      address: null,
      customerNameSnapshot: null,
      customerPhoneSnapshot: null,
      deliveryLine1Snapshot: null,
      deliveryCitySnapshot: null,
      customerLat: null,
      customerLng: null,
    })).toEqual({
      user: { name: "Cliente de balcão", phone: null },
      address: null,
    });
  });
});
