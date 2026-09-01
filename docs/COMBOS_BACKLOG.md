# VAIPIZZA — Combos (future feature)

Combos belong to the restaurant management/catalog, not hard-coded in the customer site.

Before implementation, define:
- fixed bundle vs. customer-selectable bundle;
- allowed pizza sizes/flavours;
- drink/side choices and min/max selections;
- whether modifiers/extras keep their normal price;
- combo availability by day/hour;
- promotional/fixed price and stock behavior;
- product image, title, description, ordering priority.

Expected UX later:
1. Admin creates/edits a Combo in Cardápio.
2. Combo can contain fixed items and/or selection groups.
3. Customer sees a Combos category/card and configures allowed choices.
4. Checkout stores a snapshot of the selected combo items/prices so old orders remain auditable.
