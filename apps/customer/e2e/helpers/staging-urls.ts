export interface StagingUrls {
  customerUrl: string;
  restaurantUrl: string;
  kdsUrl: string;
  courierUrl: string;
  apiUrl: string;
}

type RuntimeEnv = Record<string, string | undefined>;

type StagingUrlSpec = {
  envName: keyof typeof APPROVED_STAGING_HOSTS;
  resultName: keyof StagingUrls;
};

const APPROVED_STAGING_HOSTS = {
  QA_CUSTOMER_URL: "vaipizza-cliente-staging.netlify.app",
  QA_RESTAURANT_URL: "vaipizza-gestao-staging.netlify.app",
  QA_KDS_URL: "vaipizza-cozinha-staging.netlify.app",
  QA_COURIER_URL: "vaipizza-estafeta-staging.netlify.app",
  QA_API_URL: "vaipizza-api-staging.onrender.com",
} as const;

const URL_SPECS: StagingUrlSpec[] = [
  { envName: "QA_CUSTOMER_URL", resultName: "customerUrl" },
  { envName: "QA_RESTAURANT_URL", resultName: "restaurantUrl" },
  { envName: "QA_KDS_URL", resultName: "kdsUrl" },
  { envName: "QA_COURIER_URL", resultName: "courierUrl" },
  { envName: "QA_API_URL", resultName: "apiUrl" },
];

function parseApprovedStagingUrl(
  env: RuntimeEnv,
  envName: keyof typeof APPROVED_STAGING_HOSTS,
): string {
  const value = env[envName];
  if (!value) throw new Error(`${envName} is required`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${envName} must be a valid URL`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${envName} must use HTTPS`);
  }

  const approvedHost = APPROVED_STAGING_HOSTS[envName];
  if (url.hostname !== approvedHost) {
    throw new Error(`${envName} must target ${approvedHost}`);
  }

  return url.origin;
}

export function loadStagingUrls(env: RuntimeEnv): StagingUrls {
  const result = {} as StagingUrls;
  for (const spec of URL_SPECS) {
    result[spec.resultName] = parseApprovedStagingUrl(env, spec.envName);
  }
  return result;
}
