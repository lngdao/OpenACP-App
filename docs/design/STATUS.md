# Project Status

## Current State
- Branch: `hiru/uiux`
- Last updated: 2026-04-07

## In Progress
- Audit remaining `--color-*` tokens that may collide with Tailwind utilities (e.g. `--color-base`)
- ds-demo page polish (Brand Loader demo added, more component demos pending)

## Completed
- Custom text utility classes removed — using inline Tailwind (text-base font-medium, etc.)
- CSS/TW4 collision fix: --color-text-base → --color-text-default, @apply text-base no longer leaks color
- Brand loader: BrandIcon/BrandLoader with octopus SVG, 8 animations, ds-demo entry
- Sidebar loading: 3-dot bounce indicator, streamingSession fix
- Button ghost variant: text-foreground default, hover background only
- Icon button cleanup: removed custom color classes from sidebar-rail, composer, selectors
- Sidebar-rail tooltips: shadcn Tooltip with TooltipProvider at app level
- Empty state redesign: octopus + "Build anything" + workspace path + git info
- Config-selector: inline styles replaced with Tailwind classes
- Root div color fixed: text-foreground-weak → text-foreground
- Tauri: get_workspace_git_info command (branch + last commit)
- Settings dialog redesign: Dialog overlay with grouped sidebar nav + card groups
- Color token migration (all 3 phases): shadcn tokens as source of truth
- Typography system refactor: semantic naming, rem-based scale
- shadcn/ui migration: 19 components installed, 15 app components migrated
- Design system demo page: ds-demo.html with 18+ entries
- All prior completed items from previous sessions

## Blockers
- No test framework yet (Vitest + React Testing Library)
- `--color-base` in @theme still creates ambiguous `text-base` utility — needs rename or removal
