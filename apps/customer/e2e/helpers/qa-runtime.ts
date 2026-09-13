import { loadStagingUrls, type StagingUrls } from "./staging-urls";

type RuntimeEnv = Record<string, string | undefined>;

export type QaRuntime = StagingUrls;

const STAGING_COURIER_URL = "https://vaipizza-estafeta-staging.netlify.app";

function parseLoopbackCourierUrl(value: string | undefined): string {
  if (!value) throw new Error("QA_COURIER_URL is required");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("QA_COURIER_URL must be a valid URL");
  }

  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("QA_COURIER_URL local override must target loopback");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("QA_COURIER_URL local override must use HTTP or HTTPS");
  }

  return url.origin;
}

export function loadQaRuntime(env: RuntimeEnv): QaRuntime {
  if (env.QA_ALLOW_LOCAL_COURIER !== "1") return loadStagingUrls(env);

  const courierUrl = parseLoopbackCourierUrl(env.QA_COURIER_URL);
  const staging = loadStagingUrls({
    ...env,
    QA_COURIER_URL: STAGING_COURIER_URL,
  });

  return { ...staging, courierUrl };
}
