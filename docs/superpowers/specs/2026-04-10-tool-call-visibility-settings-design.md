# Tool Call Visibility Settings

**Date:** 2026-04-10
**Status:** Draft

## Overview

Add a setting that controls whether individual tool call blocks auto-expand their IN/OUT detail body in the chat view. Users can choose from three presets or configure visibility per tool kind.

The default preset is "Important" — only high-impact tool kinds (edit, write, execute, agent) expand automatically. Low-signal kinds (read, search, web, skill, other) remain collapsed unless the user clicks to open them.

## Goals

- Reduce visual noise in the chat timeline for users who don't need to see every tool's IN/OUT output by default
- Preserve the ability to inspect any tool on demand (clicking the header still toggles)
- Give power users fine-grained control per tool kind

## Non-Goals

- Hiding tool cards entirely (card header always remains visible)
- Per-session or per-workspace settings (global app setting only)
- Changing how noise-grouped tools (`ToolGroup`) behave

---

## Thinking Block Auto-Collapse Fix

**Current bug:** `ThinkingBlockView` opens during streaming but never auto-closes when streaming ends — it stays open indefinitely. The `useEffect` only sets `open = true` and does nothing on `isStreaming → false`.

**Fix:** Update the effect to also collapse when streaming ends:

```typescript
// Before
useEffect(() => {
  if (block.isStreaming) setOpen(true)
}, [block.isStreaming])

// After
useEffect(() => {
  if (block.isStreaming) {
    setOpen(true)
  } else {
    setOpen(false)
  }
}, [block.isStreaming])
```

This is a hardcoded behavior fix (not a setting): thinking blocks open while streaming, then collapse when done. The user can still manually expand them by clicking.

**File affected:** `src/openacp/components/chat/blocks/thinking-block.tsx`

---

## Data Model

### New field in `AppSettings`

```typescript
interface AppSettings {
  // ...existing fields...
  toolAutoExpand: Record<string, boolean>
}
```

### Default value (preset "Important")

```typescript
toolAutoExpand: {
  read: false,
  search: false,
  edit: true,
  write: true,
  execute: true,
  agent: true,
  web: false,
  skill: false,
  other: false,
}
```

### Presets (constants, not stored)

```typescript
const TOOL_EXPAND_PRESETS = {
  all: {
    read: true, search: true, edit: true, write: true,
    execute: true, agent: true, web: true, skill: true, other: true,
  },
  important: {
    read: false, search: false, edit: true, write: true,
    execute: true, agent: true, web: false, skill: false, other: false,
  },
  none: {
    read: false, search: false, edit: false, write: false,
    execute: false, agent: false, web: false, skill: false, other: false,
  },
} as const
```

The active preset is **computed** by comparing `toolAutoExpand` against the three presets. No separate "active preset" field is stored. If `toolAutoExpand` matches none of the three presets, no tab appears active (custom state).

---

## UI — Settings → Appearance

A new `SettingCard` titled **"Tool Calls"** is added to `SettingsAppearance`, below the existing Typography card.

```
┌─ Tool Calls ──────────────────────────────────────────────────────┐
│                                                                    │
│  Auto-expand detail     [All] [Important] [None]                  │
│  Controls which tool calls show IN/OUT details by default          │
│                                                                    │
│  ── Per-kind overrides ───────────────────────────────────────────│
│  Read         ○ (off)                                              │
│  Search       ○ (off)                                              │
│  Edit         ● (on)                                               │
│  Write        ● (on)                                               │
│  Bash         ● (on)                                               │
│  Agent        ● (on)                                               │
│  Web          ○ (off)                                              │
│  Skill        ○ (off)                                              │
│  Other        ○ (off)                                              │
└────────────────────────────────────────────────────────────────────┘
```

**Preset tabs behavior:**
- Selecting a preset tab overwrites all 9 kind values in `toolAutoExpand`
- The active tab highlights only when `toolAutoExpand` exactly matches a preset
- Toggling any individual switch may leave no tab highlighted (custom configuration)

**Kind labels** (matching `KIND_LABELS` in `block-utils.ts`):

| kind | label |
|------|-------|
| read | Read |
| search | Search |
| edit | Edit |
| write | Write |
| execute | Bash |
| agent | Agent |
| web | Web |
| skill | Skill |
| other | Other |

---

## Runtime Consumption

### Context

A new React context `ToolDisplayContext` is added:

```typescript
interface ToolDisplayContext {
  shouldAutoExpand: (kind: string) => boolean
  updateToolAutoExpand: (value: Record<string, boolean>) => Promise<void>
}
```

`ToolDisplayProvider` is placed at the app root alongside `BrowserPanelProvider` (outside workspace/session providers — it is a global display setting).

On mount, the provider loads `toolAutoExpand` from the Tauri settings store once and holds it in React state. `updateToolAutoExpand` writes to both the store and updates the state, ensuring the settings dialog and the runtime stay in sync without a CustomEvent.

When `toolAutoExpand` state changes, existing already-rendered `ToolBlockView` instances keep their current expanded state (because `useState` initializer doesn't re-run). Only newly mounted tool blocks reflect the new setting. This avoids disruptive UI jumps mid-conversation.

The settings dialog reads the current value and calls `updateToolAutoExpand` via `useToolDisplay()` instead of using `getSetting`/`setSetting` directly.

### `ToolBlockView` change

```typescript
// Before
const [expanded, setExpanded] = useState(true)

// After
const { shouldAutoExpand } = useToolDisplay()
const [expanded, setExpanded] = useState(() => shouldAutoExpand(block.kind))
```

Using the initializer form of `useState` ensures the setting is only read once at mount time per block instance.

---

## Files Affected

| File | Change |
|------|--------|
| `src/openacp/lib/settings-store.ts` | Add `toolAutoExpand` to `AppSettings`, defaults, and `getAllSettings` (which manually lists each key) |
| `src/openacp/context/tool-display.tsx` | New context + provider + `useToolDisplay` hook |
| `src/openacp/components/chat/blocks/tool-block.tsx` | Read initial expanded state from context |
| `src/openacp/components/settings/settings-appearance.tsx` | Add Tool Calls `SettingCard` with preset tabs + per-kind switches |
| `src/openacp/components/chat/blocks/thinking-block.tsx` | Fix auto-collapse after streaming ends |
| `src/openacp/app.tsx` | Add `ToolDisplayProvider` alongside `BrowserPanelProvider` at app root |

---

## Edge Cases

- **Unknown kind**: `shouldAutoExpand` falls back to `false` for any kind not in the map (safe default — collapsed is less disruptive than unexpected expansion)
- **Missing setting key**: `getSetting("toolAutoExpand")` returns the default object if not yet stored (backward compatible)
- **Partial stored object**: If a stored `toolAutoExpand` is missing some keys (e.g., old app version didn't have `other`), missing keys fall back to `false`
