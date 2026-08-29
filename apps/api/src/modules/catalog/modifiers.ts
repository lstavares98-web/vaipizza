import type { ModifierGroup, ModifierOption } from "@prisma/client";
import { badRequest } from "../../utils/AppError.js";

type GroupWithOptions = ModifierGroup & { options: ModifierOption[] };

/**
 * Validates a customer's modifier-option selection against a product's
 * modifier groups (required/min/max per group, options must belong to the
 * product) and returns the flat list of chosen options for pricing.
 */
export function validateModifierSelections(
  groups: GroupWithOptions[],
  selectedOptionIds: string[],
): ModifierOption[] {
  const selectedSet = new Set(selectedOptionIds);
  const chosen: ModifierOption[] = [];
  const seenOptionIds = new Set<string>();

  for (const group of groups) {
    const optionsInGroup = group.options.filter((o) => selectedSet.has(o.id));
    if (group.required && optionsInGroup.length === 0) {
      throw badRequest(`"${group.name}" requer pelo menos uma seleção`, "MODIFIER_REQUIRED");
    }
    if (optionsInGroup.length < group.minSelect) {
      throw badRequest(`"${group.name}" requer no mínimo ${group.minSelect} opções`, "MODIFIER_MIN");
    }
    if (optionsInGroup.length > group.maxSelect) {
      throw badRequest(`"${group.name}" permite no máximo ${group.maxSelect} opções`, "MODIFIER_MAX");
    }
    for (const o of optionsInGroup) {
      chosen.push(o);
      seenOptionIds.add(o.id);
    }
  }

  const unknown = selectedOptionIds.filter((id) => !seenOptionIds.has(id));
  if (unknown.length > 0) {
    throw badRequest("Uma ou mais opções não pertencem a este produto", "MODIFIER_UNKNOWN_OPTION");
  }

  return chosen;
}
