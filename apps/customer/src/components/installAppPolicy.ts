export type InstallAction = "hidden" | "native" | "ios-guide" | "browser-guide";

export function getInstallAction(input: {
  standalone: boolean;
  ios: boolean;
  hasNativePrompt: boolean;
}): InstallAction {
  if (input.standalone) return "hidden";
  if (input.hasNativePrompt) return "native";
  if (input.ios) return "ios-guide";
  return "browser-guide";
}
