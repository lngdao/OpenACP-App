# Project Status

## Current State
- Branch: `hiru/uiux`
- Last updated: 2026-04-06

## In Progress
- Color token migration Phase 3 — remove legacy backward-compat aliases from theme.css (~600 lines to trim)

## Completed
- Setup moi truong dev (Node.js, pnpm, Rust, Tauri)
- Build va chay full Tauri app
- 18 Pencil mockup screens with shadcn component refs
- shadcn/ui migration: 19 components installed, 15 app components migrated
- Token alias layer (sidebar tokens) in theme.css + Tailwind colors
- All lucide-react imports replaced with @phosphor-icons/react
- Agent/config selectors: createPortal → shadcn DropdownMenu
- Plugins modal + add-workspace modal: manual portal → shadcn Dialog
- App icons regenerated from IconKitchen (all platforms, RGBA, round masks)
- CLAUDE.md updated: React 19, shadcn/ui, git workflow, design reference
- DESIGN.md full rewrite with current architecture
- PR #3 review fixes: dead deps, unused components, dead CSS, icons, "use client"
- Color token migration Phase 1+2: shadcn tokens as source of truth, 27 components migrated

## Blockers
- No test framework yet (Vitest + React Testing Library)
