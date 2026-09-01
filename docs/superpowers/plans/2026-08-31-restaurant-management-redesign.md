# VAIPIZZA Restaurant Management Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Turn the restaurant-owner app into the polished VAIPIZZA operational admin without changing order/menu contracts.

**Architecture:** Keep routes and functional pages. Redesign the shell, orders board, menu management and reporting surfaces around the single-store VAIPIZZA identity. Technical platform admin remains separate.

**Tech Stack:** React 18, React Router, TypeScript, Vite, Socket.IO, CSS.

**Spec:** `docs/superpowers/specs/2026-08-31-vaipizza-visual-functional-design.md`

## Global Constraints
- `apps/restaurant` is the daily operational admin.
- `apps/admin` remains technical and is not exposed as the restaurant admin.
- Preserve all existing API actions.
- Desktop/tablet are primary; mobile must remain usable.

### Task 1: Management shell
- Modify `components/Layout.tsx`, `index.css`.
- Professional sidebar, page header, mobile nav and correct VAIPIZZA language.

### Task 2: Orders dashboard
- Modify `pages/OrdersDashboard.tsx`, `index.css`.
- Clear stats, board stages, delivery/takeaway and payment emphasis, better action hierarchy.

### Task 3: Menu management
- Modify `pages/Menu.tsx`, `components/ProductForm.tsx` only where markup is needed; style primarily in CSS.
- Improve product list, availability and edit/create actions.
- Do not implement combos until combo rules are defined; record it as a future admin/catalog capability.

### Task 4: Reports/cash/settings polish
- Keep data logic; unify page typography, cards, tables and forms.
