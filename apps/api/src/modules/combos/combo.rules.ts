export interface ComboProductRef {
  id: string;
  name: string;
  isAvailable: boolean;
  stock: number | null;
}

export interface ComboRuleShape {
  basePrice: number;
  availableDays: number[];
  availableFrom: string | null;
  availableTo: string | null;
  fixedItems: Array<{ quantity: number; product: ComboProductRef }>;
  groups: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: Array<{ id: string; priceDelta: number; product: ComboProductRef }>;
  }>;
}

export interface ComboSelectionInput {
  groupId: string;
  optionIds: string[];
}

export interface ValidatedComboOption {
  groupId: string;
  groupName: string;
  optionId: string;
  productId: string;
  productName: string;
  priceDelta: number;
}

function productAvailable(product: ComboProductRef) {
  return product.isAvailable && (product.stock == null || product.stock > 0);
}

function zonedClockParts(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const values = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: dayMap[values.weekday!]!,
    hhmm: `${values.hour}:${values.minute}`,
  };
}

export function isComboScheduleAvailable(combo: ComboRuleShape, now = new Date(), timeZone = "Europe/Lisbon") {
  const { day, hhmm } = zonedClockParts(now, timeZone);
  if (combo.availableDays.length > 0 && !combo.availableDays.includes(day)) return false;
  if (combo.availableFrom && hhmm < combo.availableFrom) return false;
  if (combo.availableTo && hhmm > combo.availableTo) return false;
  if (combo.fixedItems.some((item) => !productAvailable(item.product))) return false;
  return combo.groups.every((group) => group.options.filter((option) => productAvailable(option.product)).length >= group.minSelect);
}

export function validateComboSelection(combo: ComboRuleShape, selection: ComboSelectionInput[]): ValidatedComboOption[] {
  const byGroup = new Map(selection.map((entry) => [entry.groupId, entry]));
  for (const selectedGroupId of byGroup.keys()) {
    if (!combo.groups.some((group) => group.id === selectedGroupId)) {
      throw new Error("Grupo de combo inválido");
    }
  }

  const validated: ValidatedComboOption[] = [];
  for (const group of combo.groups) {
    const selectedIds = byGroup.get(group.id)?.optionIds ?? [];
    const uniqueIds = Array.from(new Set(selectedIds));
    if (uniqueIds.length < group.minSelect) {
      throw new Error(`Selecione no mínimo ${group.minSelect} opção(ões) em ${group.name}`);
    }
    if (uniqueIds.length > group.maxSelect) {
      throw new Error(`Selecione no máximo ${group.maxSelect} opção(ões) em ${group.name}`);
    }
    for (const optionId of uniqueIds) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option) throw new Error("Opção de combo inválida");
      if (!productAvailable(option.product)) throw new Error(`A opção ${option.product.name} está indisponível`);
      validated.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        productId: option.product.id,
        productName: option.product.name,
        priceDelta: option.priceDelta,
      });
    }
  }
  return validated;
}

export function priceCombo(combo: ComboRuleShape, selection: ComboSelectionInput[]): number {
  const selected = validateComboSelection(combo, selection);
  const price = combo.basePrice + selected.reduce((sum, option) => sum + option.priceDelta, 0);
  return Math.round(price * 100) / 100;
}


export function buildComboSelectionSnapshot(combo: ComboRuleShape, selection: ComboSelectionInput[]) {
  const selected = validateComboSelection(combo, selection);
  return {
    fixedItems: combo.fixedItems.map((fixed) => ({
      productId: fixed.product.id,
      productName: fixed.product.name,
      quantity: fixed.quantity,
    })),
    selectedOptions: selected.map((option) => ({ ...option })),
  };
}
