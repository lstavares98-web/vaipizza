export const COURIER_SESSION_TERMINATED_EVENT = "vaipizza:courier-session-terminated";

export function courierSessionTerminationMessage(code?: string | null) {
  if (code === "COURIER_SESSION_REPLACED") {
    return "A sua conta foi iniciada noutro dispositivo.";
  }
  return null;
}
