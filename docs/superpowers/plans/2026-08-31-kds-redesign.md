# VAIPIZZA KDS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Make the kitchen screen glanceable from distance, touch-safe, and faithful to the existing one-action READY flow.

**Architecture:** Keep existing API/socket behavior. Add pure presentation helpers for preparation timing/urgency and redesign ticket markup/CSS without introducing runtime dependencies.

**Tech Stack:** React 18, TypeScript, Vite, Socket.IO, CSS.

**Spec:** `docs/superpowers/specs/2026-08-31-vaipizza-visual-functional-design.md`

## Global Constraints
- Preserve the one-action kitchen workflow.
- Do not change API contracts.
- High contrast; no decorative animation.
- Do not rely on color alone for urgency.

### Task 1: Timing and urgency helper
- Create `apps/kds/src/lib/kdsPresentation.ts`.
- Create `apps/kds/tests/kdsPresentation.test.ts`.
- Test PREPARING history timing, fallback to createdAt, and normal/attention/late urgency.

### Task 2: Ticket information hierarchy
- Modify `apps/kds/src/pages/KdsBoard.tsx`.
- Show delivery/takeaway, urgency label, prep elapsed, modifiers and notes with strong hierarchy.
- Preserve disabled state while status request is pending.

### Task 3: Fullscreen kitchen design
- Modify `apps/kds/src/components/Layout.tsx` and `apps/kds/src/index.css`.
- Brand header, live ticket count, responsive grid, large READY CTA.
