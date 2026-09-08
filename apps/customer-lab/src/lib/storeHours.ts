export interface StoreHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export interface StoreHourRow {
  dayOfWeek: number;
  day: string;
  label: string;
  isClosed: boolean;
}

const DAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export function formatWeeklyHours(hours: StoreHour[] = []): StoreHourRow[] {
  return DAY_LABELS.map((day, dayOfWeek) => {
    const configured = hours.find((hour) => hour.dayOfWeek === dayOfWeek);
    if (!configured) {
      return { dayOfWeek, day, label: "Horário a confirmar", isClosed: true };
    }
    if (configured.isClosed) {
      return { dayOfWeek, day, label: "Fechado", isClosed: true };
    }
    return {
      dayOfWeek,
      day,
      label: `${configured.opensAt} – ${configured.closesAt}`,
      isClosed: false,
    };
  });
}
