export function isCurrentCourierSession(tokenVersion: number | undefined, currentVersion: number) {
  return Number.isInteger(tokenVersion) && tokenVersion === currentVersion;
}
