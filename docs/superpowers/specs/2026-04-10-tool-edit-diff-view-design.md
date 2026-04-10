# Tool Edit Diff View — Design Spec

**Date:** 2026-04-10
**Status:** Approved

## Overview

Replace the generic IN/OUT text display in tool blocks with a proper diff view for `edit` and `write` tool kinds. The diff view shows additions and deletions at a glance, collapses automatically when the file is large (>10 source lines), and adapts between side-by-side and unified layouts based on available container width.

All other tool kinds retain the existing IN/OUT display unchanged.

---

## Goals

- Make file edits immediately readable in the conversation — user sees what changed without opening the Review panel
- Side-by-side on wide containers, unified on narrow (responsive via CSS container queries)
- Collapse large diffs to a 10-line preview; expand inline on demand; ArrowsOut opens full modal
- `write` tool (new file, no `before`) renders unified additions-only view

---

## Data Flow

### Problem

`ToolBlock` currently stores only `diffStats` (line counts). The actual `before`/`after` content lives in `ToolCallPart.diff` (type `FileDiff`). The `extractDiff()` function in `chat.tsx` already extracts this data from SSE events — it just isn't propagated to the block.

### Solution: Add `diff` to `ToolBlock`

**`types.ts`** — add one field:

```ts
export interface ToolBlock {
  // ... existing fields ...
  diff?: FileDiff | null   // added
}
```

**`chat.tsx`** — three update sites:

1. **SSE `tool_call` handler** — when pushing a new ToolBlock, include `diff: extractDiff(evt)`
2. **SSE `tool_update` handler** — `existing.diff = extractDiff(evt) ?? existing.diff` (keep previous if update has no diff)
3. **`historyStepToBlock()`** — extract diff from history step data using the same pattern already used for history parts:
   ```ts
   diff: s.diff ? { path: s.diff.path || "", before: s.diff.oldText, after: s.diff.newText } : null
   ```

---

## Component Architecture

### New: `diff-utils.ts`

Extract `computeDiffLines()` from `review-panel.tsx` into a shared utility at `src/openacp/components/chat/diff-utils.ts`. `review-panel.tsx` imports from here. Prevents code duplication.

```ts
export interface DiffLine {
  type: "add" | "del" | "normal" | "hunk"
  content: string
  oldNum?: number
  newNum?: number
}

export function computeDiffLines(before: string, after: string, path: string): DiffLine[]
```

### New: `tool-diff-view.tsx`

Location: `src/openacp/components/chat/blocks/tool-diff-view.tsx`

**Props:**
```ts
interface ToolDiffViewProps {
  diff: FileDiff
  maxPreviewLines?: number  // default 10
  expanded?: boolean        // when true, always show full (used in modal)
}
```

**Collapse logic:**
- `totalLines = Math.max(before?.split('\n').length ?? 0, after.split('\n').length)`
- If `totalLines <= 10` or `expanded === true`: render full diff
- If `totalLines > 10`: render first 10 diff output lines + expand button
- Expand button label: `+ N more lines ↕` where N = totalLines - 10
- Click → set local `isExpanded` state to true (inline, no re-mount)

**Responsive layout via CSS container query:**

The wrapper div has `container-type: inline-size`. The query breakpoint is **540px**:

- `> 540px` → **Side-by-side layout**
- `≤ 540px` → **Unified layout**

**Side-by-side layout (wide):**

Two equal-width columns with a divider:

```
┌─────────────────────────┬─────────────────────────┐
│ BEFORE                  │ AFTER                   │
│  10  const z = old_val  │  10  const z = new_val  │
│ -11  removed line       │ +11  added line         │
│  12  return x           │  12  return x           │
└─────────────────────────┴─────────────────────────┘
```

- Process each hunk: collect consecutive del/add lines and pair them row by row (del[i] → left, add[i] → right)
- Unpaired dels: left column shows line, right is empty
- Unpaired adds: left is empty, right column shows line
- Context lines: appear in both columns at the same row
- Each column has its own line number gutter (old nums on left, new nums on right)
- Deleted lines: red background in left column only
- Added lines: green background in right column only

**Unified layout (narrow):**

Same as existing `DiffView` in `review-panel.tsx` — single column, old+new line numbers, `-`/`+` signs, color-coded lines.

**Write tool (no `before`):**

When `diff.before` is undefined, side-by-side is not applicable. Always render unified layout regardless of container width. All `after` lines render as additions (green).

**Styling:**
- Font: monospace, 12px (consistent with review-panel)
- Colors: `--syntax-diff-add` (green), `--syntax-diff-delete` (red) — existing CSS vars
- Backgrounds: semi-transparent tints of the same vars

### Modified: `tool-block.tsx`

**Render logic for edit/write kinds:**

```
if (kind === "edit" || kind === "write") AND block.diff != null:
  → render <ToolDiffView diff={block.diff} />  (instead of IN/OUT grid)
else:
  → render existing IN/OUT grid (fallback, keeps compatibility)
```

**Modal (ArrowsOut):**

When `block.diff` is available for edit/write: render `<ToolDiffView diff={block.diff} expanded={true} />` in the dialog instead of the IN/OUT text rows. The `expanded` prop disables collapse — always show full diff in modal.

**`components.css`:**

Add `container-type: inline-size` to `.oac-tool-card-body` so child `@container` queries work correctly.

---

## Behavior Summary

| Scenario | Behavior |
|---|---|
| `edit` with diff, ≤10 source lines | Full side-by-side or unified (auto) |
| `edit` with diff, >10 source lines | 10-line preview + expand button |
| `edit` with diff, expanded | Full diff inline |
| `edit` with diff, modal open | Full diff, never collapsed |
| `write` (no before) | Unified additions-only, any container width |
| `edit`/`write` with null diff | Fallback to existing IN/OUT display |
| Any other tool kind | Existing IN/OUT display, unchanged |

---

## Files Changed

| File | Change |
|---|---|
| `src/openacp/types.ts` | Add `diff?: FileDiff \| null` to `ToolBlock` |
| `src/openacp/context/chat.tsx` | Populate `diff` in 3 sites (tool_call, tool_update, history) |
| `src/openacp/components/chat/diff-utils.ts` | NEW — shared `computeDiffLines`, `DiffLine` type |
| `src/openacp/components/chat/blocks/tool-diff-view.tsx` | NEW — inline diff component (unified + side-by-side) |
| `src/openacp/components/chat/blocks/tool-block.tsx` | Use ToolDiffView for edit/write kinds |
| `src/openacp/components/review-panel.tsx` | Import `computeDiffLines` from diff-utils |
| `src/openacp/styles/components.css` | Add `container-type` to `.oac-tool-card-body` |
