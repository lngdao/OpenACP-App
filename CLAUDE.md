# CLAUDE.md

Project-level guidance for agents working on **OpenACP Desktop**. Read this before any UI work.

Architecture / commands / git workflow live in `.claude/CLAUDE.md` (agent-local). This file is **design rules only**.

---

## Required reading (before touching UI)

- `docs/design/DESIGN.md` — tokens, components, patterns (full reference)
- `docs/design/pencil/openacp.pen` — Pencil mockups. **Pencil MCP tools only** (file is encrypted)
- `docs/design/plans/` — in-progress multi-phase plans
- Live demo: `http://localhost:1420/ds-demo.html`

For new screens, match the closest existing Pencil frame 1:1 before coding.

## When UI changes land

- New/changed token → update `DESIGN.md` + `src/ds-demo/registry.tsx`
- New/changed component → add demo entry in `registry.tsx`
- New/changed layout → update the Pencil frame
- Multi-commit refactor → write a plan in `docs/design/plans/`

---

## Key rules

- **Never hardcode colors.** Use design tokens only. No hex, no Tailwind native palette (`emerald-*`, `slate-*`...), no inline `style={{ color }}`.
- **Never use font-weight above 500** (`font-medium`). No `semibold`/`bold`. Use color/size for emphasis.
- **Never use font-size below 11px** (`text-2xs`).
- **Never use arbitrary spacing.** 4px grid only — pick from the scale.
- **Never use emoji in UI.** Use `@phosphor-icons/react` icons.
- **Prefer shadcn primitives** (`Button`, `Input`, `Badge`, `Dialog`...) over raw HTML. Extend variants, don't override with className.
- **Dark mode is first-class.** Verify every change in both themes before committing.
- **Prototype in Pencil first** for new screens or significant layout changes.

See `docs/design/DESIGN.md` for the token list, class names, and examples.
