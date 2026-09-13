import type { BrowserRecoveryFixtureDocument } from "./browserRecoveryFixture.js";

export {
  cleanupBrowserRecoveryFixture as cleanupBrowserFixture,
  prepareBrowserRecoveryFixture as prepareBrowserFixture,
  readBrowserRecoveryFixtureFile as readBrowserFixtureFile,
} from "./browserRecoveryFixture.js";

export type BrowserFixtureCommand = "prepare" | "cleanup";

export interface BrowserFixtureArtifactView {
  runId: string;
  apiUrl: string;
  orderId: string;
  orderNumber: number;
  emails: {
    customer: string;
    restaurant: string;
    kds: string;
    courier: string;
  };
  credentialsPersisted: false;
}

export function parseBrowserFixtureCommand(command: string | undefined): BrowserFixtureCommand | null {
  if (command === "browser-fixture-prepare" || command === "browser-recovery-prepare") return "prepare";
  if (command === "browser-fixture-cleanup" || command === "browser-recovery-cleanup") return "cleanup";
  return null;
}

export function buildBrowserFixtureArtifactView(
  fixture: BrowserRecoveryFixtureDocument,
): BrowserFixtureArtifactView {
  return {
    runId: fixture.runId,
    apiUrl: fixture.apiUrl,
    orderId: fixture.orderId,
    orderNumber: fixture.orderNumber,
    emails: {
      customer: fixture.credentials.customer.email,
      restaurant: fixture.credentials.restaurant.email,
      kds: fixture.credentials.kds.email,
      courier: fixture.credentials.courier.email,
    },
    credentialsPersisted: false,
  };
}
