# CLAUDE.md

Project-level guidance for agents working on **OpenACP Desktop** (Tauri 2 + React 19 + Tailwind 4 + shadcn/ui). Read this **before** touching UI or architecture.

The canonical architecture/commands/git-workflow doc is `.claude/CLAUDE.md` (agent-local, not tracked). This file focuses on **design rules** and **required reading** for any UI work.

---

## Required reading before UI work

**Always open these before writing or modifying UI code.** No exceptions.

- `docs/design/DESIGN.md` — design system overview (tokens, principles, components)
- `docs/design/pencil/openacp.pen` — Pencil mockups (18 screens, 87 components). Read via **Pencil MCP tools only** — the file is encrypted, do **not** use `Read`/`Grep`
- `docs/design/plans/` — multi-phase plans for in-progress work (color refactor, etc.)
- Live design-system demo: `http://localhost:1420/ds-demo.html` (run `pnpm dev` first)

If you're building a new screen, also open the closest existing Pencil frame to match layout 1:1 before coding.

---

## When making UI changes, update docs

If the change affects tokens, components, or design patterns:

- New or changed token → update `docs/design/DESIGN.md` and the `Colors` / `Typography` entries in `src/ds-demo/registry.tsx`
- New or changed component → update `docs/design/DESIGN.md` + add a demo entry in `src/ds-demo/registry.tsx`
- New or changed layout pattern → update the relevant frame in `docs/design/pencil/openacp.pen` via Pencil MCP
- Refactor spanning multiple commits → write a plan in `docs/design/plans/<name>.md` and reference it in each commit

---

## Key design rules

### Colors — never hardcode, always use tokens

The design system has **3 neutral families (bg / fg / border) × 4 levels** plus a **flat semantic palette**. All tokens live in `src/openacp/styles/theme.css` and are registered as Tailwind utilities in `src/openacp/styles/index.css`.

**Neutral tokens** (Tailwind utility → CSS variable):

- Background: `bg-bg-base`, `bg-bg-weak`, `bg-bg-weaker`, `bg-bg-weakest`, `bg-bg-strong` (elevated — card / popover / dropdown / modal)
- Foreground: `text-fg-base`, `text-fg-weak`, `text-fg-weaker`, `text-fg-weakest`
- Border: `border-border-base`, `border-border-weak`, `border-border-weaker`, `border-border-weakest`

**Semantic tokens** (5 colors × 2 weights):

- `bg-success` / `bg-success-weak`, `text-success`
- `bg-warning` / `bg-warning-weak`
- `bg-critical` / `bg-critical-weak`  (= shadcn `destructive`)
- `bg-info` / `bg-info-weak`
- `bg-interactive` / `bg-interactive-weak` (= focus ring / link)

**shadcn aliases** (for third-party components — `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, etc.) all resolve to the tokens above. Prefer the `bg-*/fg-*` direct tokens in new code.

**Rules:**

- **Never** write `color: #171717` or inline `style={{ color: "..." }}` with hex/rgb.
- **Never** use Tailwind arbitrary color values like `bg-[#f3f3f3]` or `text-emerald-400` — use the token that matches the intent.
- **Never** use Tailwind's built-in palette (`bg-slate-500`, `text-green-600`, etc.) — they're not tied to our theme and won't switch with light/dark.

### Typography

- **Font sizes**: `text-2xs` (11px), `text-xs` (12px), `text-sm` (14px), `text-base` (16px), `text-lg` (18px), `text-xl` (20px), `text-2xl` (24px), `text-3xl` (28px). Registered in `src/openacp/styles/index.css` `@theme` block.
- **Never use font sizes below 11px** (`text-2xs`). Anything smaller fails accessibility and looks broken on Retina scaling.
- **Font weight max is 500** (`font-medium`). Do not use `font-semibold` (600), `font-bold` (700), or heavier — the brand wants a quiet, restrained typography feel. If you need emphasis, use color contrast (`text-fg-base` vs `text-fg-weak`) or size, not weight.
- Only two weights in the system: `font-normal` (400) and `font-medium` (500). Registered as `--font-weight-regular` and `--font-weight-medium`.
- Font family: `font-sans` ("SF Pro" primary) for UI, `font-mono` for code.

### Spacing — 4px grid

- Tailwind spacing base is `0.25rem` (4px). **Use only multiples of 4** via the spacing scale: `p-1` (4px), `p-2` (8px), `p-3` (12px), `p-4` (16px), `p-5` (20px), `p-6` (24px), `p-8` (32px), `p-10` (40px), `p-12` (48px), `p-16` (64px).
- **Do not use arbitrary values** like `p-[13px]` or `gap-[7px]`. Pick the closest grid step.
- Half-steps (`p-0.5`, `p-1.5`, `p-2.5`, `p-3.5`) are allowed for tight compositions but should be the exception, not the rule.

### Icons

- Use **`@phosphor-icons/react`** exclusively. No inline SVG for standard icons.
- **Never use emoji in UI** (text, labels, buttons, empty states). Emoji rendering is OS-specific and breaks pixel-grid alignment. Exception: allowed only inside user-authored chat content that we render as-is.
- Icon sizes follow the Button size scale: `icon-xs` (3), `icon-sm` (4), default (4), `icon-md` (4.5), `icon-lg` (5).

### Components

- **Always prefer shadcn/ui primitives** from `src/openacp/components/ui/` over hand-rolled HTML:
  - `<button className="...">` → `<Button variant="..." size="...">`
  - `<input className="...">` → `<Input>`
  - `<span className="rounded-full bg-... text-...">` → `<Badge variant="...">`
  - Overlays: `<Dialog>`, `<DropdownMenu>`, `<Tooltip>`, `<Sheet>`, `<Select>`
- If a shadcn primitive doesn't fit, add a variant to the component file (cva-based) rather than duplicating classes at the call site.
- **Do not override shadcn variant colors via `className`** unless strictly for layout (`absolute`, `w-full`, etc.). Extend variants instead.

### Visual identity

- Target aesthetic: quiet, native desktop feel. Think Linear, Raycast, Notion — not flashy SaaS dashboards.
- Soft borders (`border-border-weak` / `border-border-weaker`), generous whitespace, minimal shadows, short animations (200–300ms, `ease-out`).
- Dark mode is a first-class citizen. Every color you pick must work in both `[data-theme="light"]` and `[data-theme="dark"]`. Verify in the demo page before committing.

---

## UI workflow checklist

For any non-trivial UI change:

1. **Read** `docs/design/DESIGN.md` + the relevant section of `docs/design/pencil/openacp.pen` (via Pencil MCP).
2. **Prototype in Pencil** for new screens or major layout changes. Get visual agreement before writing React.
3. **Code** using shadcn primitives + design tokens — never hardcode.
4. **Verify** both light and dark mode at `http://localhost:1420/ds-demo.html` and in the live app (`pnpm tauri dev`).
5. **Update** demo registry and `DESIGN.md` if you added/changed tokens or components.
6. **Commit** — one logical change per commit, conventional format, no Co-Authored-By. Never spam tiny WIP commits.

---

## Red flags — stop and reconsider

- Arbitrary Tailwind values (`bg-[#...]`, `p-[13px]`, `text-[11px]`)
- Tailwind's native color palette (`emerald-*`, `slate-*`, `zinc-*`, etc.)
- Inline `style={{ color: ..., padding: ... }}` with raw values
- Font weight ≥ 600
- Font size < 11px
- Emoji in interface text
- Raw `<button>` / `<input>` when a shadcn primitive exists
- New documentation files (`.md`) created without being asked
