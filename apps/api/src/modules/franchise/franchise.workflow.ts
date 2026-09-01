export interface FranchiseLeadInputShape {
  name: string;
  phone: string;
  email: string;
  cityRegion: string;
  message: string;
}

interface Dependencies<T> {
  save: (input: FranchiseLeadInputShape) => Promise<T>;
  notify: (lead: T) => Promise<void>;
  onNotifyError: (error: unknown, lead: T) => void;
}

export async function storeThenNotifyFranchiseLead<T>(input: FranchiseLeadInputShape, deps: Dependencies<T>): Promise<T> {
  const lead = await deps.save(input);
  try {
    await deps.notify(lead);
  } catch (error) {
    deps.onNotifyError(error, lead);
  }
  return lead;
}
