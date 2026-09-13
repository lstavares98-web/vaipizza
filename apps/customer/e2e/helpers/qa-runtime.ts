import { loadStagingUrls, type StagingUrls } from "./staging-urls";

type RuntimeEnv = Record<string, string | undefined>;

export type QaRuntime = StagingUrls;

export function loadQaRuntime(env: RuntimeEnv): QaRuntime {
  return loadStagingUrls(env);
}
