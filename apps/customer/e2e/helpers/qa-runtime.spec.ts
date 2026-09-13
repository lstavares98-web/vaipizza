import { expect, test } from "@playwright/test";
import { loadQaRuntime } from "./qa-runtime";

const VALID_ENV = {
  QA_CUSTOMER_URL: "https://vaipizza-cliente-staging.netlify.app",
  QA_RESTAURANT_URL: "https://vaipizza-gestao-staging.netlify.app",
  QA_KDS_URL: "https://vaipizza-cozinha-staging.netlify.app",
  QA_COURIER_URL: "https://vaipizza-estafeta-staging.netlify.app",
  QA_API_URL: "https://vaipizza-api-staging.onrender.com",
};

test("rejects a missing required staging URL", () => {
  expect(() => loadQaRuntime({ ...VALID_ENV, QA_KDS_URL: undefined })).toThrow(
    "QA_KDS_URL is required",
  );
});

test("rejects non-HTTPS staging URLs", () => {
  expect(() =>
    loadQaRuntime({ ...VALID_ENV, QA_CUSTOMER_URL: "http://vaipizza-cliente-staging.netlify.app" }),
  ).toThrow("QA_CUSTOMER_URL must use HTTPS");
});

test("rejects a URL outside the approved staging host", () => {
  expect(() => loadQaRuntime({ ...VALID_ENV, QA_COURIER_URL: "https://example.com" })).toThrow(
    "QA_COURIER_URL must target vaipizza-estafeta-staging.netlify.app",
  );
});

test("returns the five approved staging endpoints", () => {
  expect(loadQaRuntime(VALID_ENV)).toEqual({
    customerUrl: VALID_ENV.QA_CUSTOMER_URL,
    restaurantUrl: VALID_ENV.QA_RESTAURANT_URL,
    kdsUrl: VALID_ENV.QA_KDS_URL,
    courierUrl: VALID_ENV.QA_COURIER_URL,
    apiUrl: VALID_ENV.QA_API_URL,
  });
});
