export function formatPortuguesePostalCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export function isPortuguesePostalCode(value: string): boolean {
  return /^\d{4}-\d{3}$/.test(value.trim());
}
