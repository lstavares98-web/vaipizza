# VAIPIZZA Courier Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Make courier operation genuinely mobile-first with one dominant action per delivery state.

**Architecture:** Preserve API/location/socket flow and Leaflet map. Add pure navigation/status helpers and redesign home, active delivery, earnings/history shell with fixed operational actions.

**Tech Stack:** React 18, React Router, TypeScript, React Leaflet, CSS.

**Spec:** `docs/superpowers/specs/2026-08-31-vaipizza-visual-functional-design.md`

## Global Constraints
- Smartphone portrait is primary.
- Never hide the active-delivery action below long content.
- No new map provider dependency.
- Preserve current status transitions.

### Task 1: Navigation/status helper
- Create `apps/courier/src/lib/deliveryPresentation.ts` and tests.
- Generate external navigation URL and friendly delivery step labels.

### Task 2: Courier shell/home
- Modify `Layout.tsx`, `Home.tsx`, `index.css`.
- Clear online state, today summary, premium delivery-offer card.

### Task 3: Active delivery
- Modify `ActiveDelivery.tsx` and CSS.
- Map-first view, navigate/call actions, one fixed primary status action.

### Task 4: Earnings/history polish
- Retain data contracts; improve typography/cards/list density via CSS and small semantic markup only.
