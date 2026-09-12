export type QaScenarioStatus = "PASS" | "FAIL" | "SKIP";

export interface QaConfig {
  environment: string;
  apiUrl: string;
  apiHostname: string;
  allowedApiHosts: string[];
  databaseHostname: string;
  databaseUsername: string;
  databasePort: string;
  databaseName: string;
  supabaseProjectRef: string;
  mutationConfirmation?: string;
  localCandidateConfirmation?: string;
}

export interface QaScenarioResult {
  name: string;
  status: QaScenarioStatus;
  durationMs: number;
  details?: Record<string, unknown>;
  reason?: string;
}

export interface QaResult {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: "PASS" | "FAIL";
  scenarios: QaScenarioResult[];
}

export interface QaRunManifest {
  runId: string;
  createdAt: string;
  environment: "staging";
  apiHost: string;
  supabaseProjectRef: string;
  scenarioNames: string[];
  customerUserIds: string[];
  operatorUserIds: string[];
  courierUserIds: string[];
  courierIds: string[];
  addressIds: string[];
  categoryIds: string[];
  productIds: string[];
  orderIds: string[];
  timings: Record<string, number>;
}

export interface ProtectedDeliveryFeeTier {
  id: string;
  upToKm: number;
  fee: number;
}

export interface ProtectedRestaurantSnapshot {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  deliveryRadiusKm: number;
  courierDispatchRadiusKm: number;
  deliveryFeeMode: string;
  deliveryFeeBase: number;
  deliveryFeePerKm: number;
  deliveryFeeFreeKm: number;
  deliveryFeeTiers: ProtectedDeliveryFeeTier[];
}

export interface ProtectedCourierSnapshot {
  id: string;
  userId: string;
  verificationStatus: string;
}

export interface ProtectedSnapshot {
  version: 1;
  restaurant: ProtectedRestaurantSnapshot;
  couriers: ProtectedCourierSnapshot[];
}

export interface SnapshotDiff {
  path: string;
  before: unknown;
  after: unknown;
}
