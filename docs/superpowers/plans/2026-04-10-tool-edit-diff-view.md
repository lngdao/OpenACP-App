# Tool Edit Diff View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the IN/OUT text display in `edit` and `write` tool blocks with a responsive diff view (side-by-side on wide containers, unified on narrow) that collapses automatically when the file exceeds 10 source lines.

**Architecture:** Add `diff?: FileDiff | null` to `ToolBlock` and populate it in `chat.tsx` at the three SSE event sites. Extract diff computation into a shared `diff-utils.ts`, then build a new `ToolDiffView` component that uses `ResizeObserver` for responsive layout. Wire it into `tool-block.tsx` for `edit`/`write` kinds.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, `diff` npm library (`structuredPatch`), `@phosphor-icons/react`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/openacp/types.ts` | Modify | Add `diff` field to `ToolBlock` |
| `src/openacp/context/chat.tsx` | Modify | Populate `diff` in ToolBlock at 3 sites |
| `src/openacp/components/chat/diff-utils.ts` | **Create** | Shared `DiffLine` type + `computeDiffLines` + `slicePreview` |
| `src/openacp/components/review-panel.tsx` | Modify | Import `computeDiffLines` from `diff-utils` |
| `src/openacp/components/chat/blocks/tool-diff-view.tsx` | **Create** | Inline diff component: unified + side-by-side, collapse logic |
| `src/openacp/components/chat/blocks/tool-block.tsx` | Modify | Use `ToolDiffView` for `edit`/`write` kinds |

---

### Task 1: Add `diff` field to `ToolBlock` type

**Files:**
- Modify: `src/openacp/types.ts:69-83`

- [ ] **Step 1: Add the field**

In `src/openacp/types.ts`, find the `ToolBlock` interface and add `diff` after `diffStats`:

```ts
export interface ToolBlock {
  type: "tool"
  id: string
  name: string
  kind: string
  status: "pending" | "running" | "completed" | "error"
  title: string
  description: string | null
  command: string | null
  input: Record<string, unknown> | null
  output: string | null
  diffStats: { added: number; removed: number } | null
  diff?: FileDiff | null   // ← add this line
  isNoise: boolean
  isHidden: boolean
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build 2>&1 | tail -20
```

Expected: no errors related to `ToolBlock`.

- [ ] **Step 3: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/types.ts
git commit -m "feat: add diff field to ToolBlock type"
```

---

### Task 2: Populate `diff` in `chat.tsx` — 3 sites

**Files:**
- Modify: `src/openacp/context/chat.tsx`

This task adds `diff` propagation at 3 locations: the `stepToBlock()` history builder, the SSE `tool_call` handler, and the SSE `tool_update` handler.

- [ ] **Step 1: Update `stepToBlock()` (history builder)**

Find `stepToBlock()` around line 56. The `tool_call` case returns a block at line 67. Change the return to include `diff`:

```ts
case "tool_call": {
  const s = step as any
  const input = (s.input as Record<string, unknown> | null) ?? null
  const kind = resolveKind(s.name ?? "", s.kind, undefined, input)
  const title = buildTitle(s.name ?? "", kind, input)
  // Extract diff from history step — server stores before in oldText, after in newText
  const diff: FileDiff | null = s.diff
    ? { path: s.diff.path || "", before: s.diff.oldText, after: s.diff.newText ?? "" }
    : null
  return {
    type: "tool", id: s.id ?? uid("b"), name: s.name ?? "", kind,
    status: (s.status as ToolBlock["status"]) || "completed",
    title, description: extractDescription(input, title),
    command: extractCommand(kind, input), input,
    output: typeof s.output === "string" ? s.output : s.output ? JSON.stringify(s.output) : null,
    diffStats: null, diff, isNoise: isNoiseTool(s.name ?? ""), isHidden: false,
  }
}
```

- [ ] **Step 2: Update SSE `tool_call` handler block push**

Find the `case "tool_call":` SSE handler around line 591. The `updateAssistantBlocks` call has two branches: `existing` (update) and new push. Add `diff` to both:

```ts
updateAssistantBlocks(sessionID, (blocks) => {
  const input = evt.rawInput ?? null
  const kind = resolveKind(evt.name, evt.kind, evt.displayKind, input)
  const title = buildTitle(evt.name, kind, input, evt.displayTitle, evt.displaySummary)
  const existing = blocks.find((b): b is ToolBlock => b.type === "tool" && b.id === evt.id)
  const outputStr = evt.rawOutput != null
    ? (typeof evt.rawOutput === "string" ? evt.rawOutput : JSON.stringify(evt.rawOutput, null, 2))
    : null
  if (existing) {
    existing.name = evt.name; existing.status = evt.status as ToolBlock["status"]
    existing.kind = kind; existing.title = title
    if (input) existing.input = input
    if (outputStr != null) existing.output = outputStr
    if (diff) existing.diff = diff   // ← add this line
  } else {
    blocks.push({
      type: "tool", id: evt.id, name: evt.name, kind,
      status: (evt.status as ToolBlock["status"]) || "running",
      title, description: extractDescription(input, title),
      command: extractCommand(kind, input), input,
      output: outputStr, diffStats: null, diff,   // ← add diff here
      isNoise: isNoiseTool(evt.name, evt.isNoise), isHidden: false,
    })
  }
})
```

Note: `diff` is already computed above this block as `const diff = extractDiff(evt)` (line 573).

- [ ] **Step 3: Update SSE `tool_update` handler**

Find the `case "tool_update":` handler around line 617. Inside `updateAssistantBlocks`, after the `if (meta?.diffStats)` block (around line 650), add:

```ts
const diff = extractDiff(evt)
if (diff) existing.diff = diff
```

The full relevant section of `tool_update` → `updateAssistantBlocks` should look like:

```ts
const meta = evt.meta as Record<string, any> | undefined
if (meta?.diffStats) {
  existing.diffStats = meta.diffStats as { added: number; removed: number }
}
const diff = extractDiff(evt)
if (diff) existing.diff = diff
```

Note: `extractDiff` is already imported/defined in scope at this point.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build 2>&1 | tail -20
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/context/chat.tsx
git commit -m "feat: propagate diff data into ToolBlock from SSE events and history"
```

---

### Task 3: Extract shared diff utilities

**Files:**
- Create: `src/openacp/components/chat/diff-utils.ts`
- Modify: `src/openacp/components/review-panel.tsx:21-52`

- [ ] **Step 1: Create `diff-utils.ts`**

Create `src/openacp/components/chat/diff-utils.ts`:

```ts
import { structuredPatch } from "diff"

export interface DiffLine {
  type: "add" | "del" | "normal" | "hunk"
  content: string
  oldNum?: number
  newNum?: number
}

/**
 * Computes a unified diff as an array of typed lines.
 * Pass empty string for `before` when the file is newly created (write tool).
 */
export function computeDiffLines(
  before: string,
  after: string,
  path: string,
): DiffLine[] {
  const patch = structuredPatch(path, path, before, after, "", "", { context: 3 })
  const lines: DiffLine[] = []
  for (const hunk of patch.hunks) {
    lines.push({
      type: "hunk",
      content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    })
    let oldNum = hunk.oldStart
    let newNum = hunk.newStart
    for (const line of hunk.lines) {
      if (line.startsWith("+"))
        lines.push({ type: "add", content: line.slice(1), newNum: newNum++ })
      else if (line.startsWith("-"))
        lines.push({ type: "del", content: line.slice(1), oldNum: oldNum++ })
      else
        lines.push({ type: "normal", content: line.slice(1), oldNum: oldNum++, newNum: newNum++ })
    }
  }
  return lines
}

/**
 * Slices a diff line array to at most `max` non-hunk content lines,
 * preserving hunk headers that appear before the cutoff.
 */
export function slicePreview(lines: DiffLine[], max: number): DiffLine[] {
  const result: DiffLine[] = []
  let contentCount = 0
  for (const line of lines) {
    if (contentCount >= max) break
    result.push(line)
    if (line.type !== "hunk") contentCount++
  }
  return result
}
```

- [ ] **Step 2: Update `review-panel.tsx` to import from `diff-utils`**

In `src/openacp/components/review-panel.tsx`, remove the local `DiffLine` interface and `computeDiffLines` function (lines 14–52) and add the import:

```ts
import { computeDiffLines, type DiffLine } from "./chat/diff-utils"
```

The `DiffView` and `DiffStats` components remain unchanged — they use `DiffLine[]` which is now imported.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/components/chat/diff-utils.ts src/openacp/components/review-panel.tsx
git commit -m "refactor: extract computeDiffLines into shared diff-utils"
```

---

### Task 4: Create `ToolDiffView` component

**Files:**
- Create: `src/openacp/components/chat/blocks/tool-diff-view.tsx`

This component renders a diff inline in the conversation. It uses `ResizeObserver` to detect container width and switches between unified (narrow) and side-by-side (wide, ≥540px) layouts. When the source file exceeds 10 lines, it collapses to a 10-line preview with an expand button.

- [ ] **Step 1: Create `tool-diff-view.tsx`**

Create `src/openacp/components/chat/blocks/tool-diff-view.tsx`:

```tsx
import React, { useState, useRef, useEffect, useMemo } from "react"
import { computeDiffLines, slicePreview, type DiffLine } from "../diff-utils"
import type { FileDiff } from "../../../types"

const PREVIEW_LINES = 10

// ── Side-by-side helpers ────────────────────────────────────────────────────

interface SideBySideRow {
  type: "hunk" | "pair"
  hunkContent?: string
  left?: DiffLine | null   // del or normal
  right?: DiffLine | null  // add or normal
}

/**
 * Converts a flat DiffLine array into paired rows for side-by-side rendering.
 * Consecutive del/add groups are zipped together; context lines appear on both sides.
 */
function buildSideBySideRows(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.type === "hunk") {
      rows.push({ type: "hunk", hunkContent: line.content })
      i++
    } else if (line.type === "normal") {
      rows.push({ type: "pair", left: line, right: line })
      i++
    } else {
      // Collect a contiguous del/add group and zip them into pairs
      const dels: DiffLine[] = []
      const adds: DiffLine[] = []
      while (i < lines.length && (lines[i].type === "del" || lines[i].type === "add")) {
        if (lines[i].type === "del") dels.push(lines[i])
        else adds.push(lines[i])
        i++
      }
      const maxLen = Math.max(dels.length, adds.length)
      for (let j = 0; j < maxLen; j++) {
        rows.push({ type: "pair", left: dels[j] ?? null, right: adds[j] ?? null })
      }
    }
  }
  return rows
}

// ── Unified diff renderer (narrow layout) ────────────────────────────────────

function UnifiedDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="oac-diff-view font-mono overflow-x-auto no-scrollbar" style={{ fontSize: "12px" }}>
      {lines.map((line, i) => (
        <div
          key={i}
          className={`oac-diff-line ${
            line.type === "add" ? "oac-diff-add"
            : line.type === "del" ? "oac-diff-del"
            : line.type === "hunk" ? "oac-diff-hunk"
            : ""
          }`}
        >
          <span className="oac-diff-gutter oac-diff-gutter-old">{line.oldNum ?? ""}</span>
          <span className="oac-diff-gutter oac-diff-gutter-new">{line.newNum ?? ""}</span>
          <span className="oac-diff-sign">
            {line.type === "add" ? "+" : line.type === "del" ? "-" : line.type === "hunk" ? "" : " "}
          </span>
          <span className="oac-diff-content">{line.content}</span>
        </div>
      ))}
    </div>
  )
}

// ── Side-by-side diff renderer (wide layout) ─────────────────────────────────

function SideBySideDiff({ rows }: { rows: SideBySideRow[] }) {
  const borderWeak = "var(--border-weak)"
  return (
    <div className="font-mono overflow-x-auto no-scrollbar" style={{ fontSize: "12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* Column headers */}
        <div
          className="px-2 text-muted-foreground"
          style={{ fontSize: "10px", padding: "2px 8px", borderBottom: `0.5px solid ${borderWeak}`, borderRight: `0.5px solid ${borderWeak}` }}
        >
          BEFORE
        </div>
        <div
          className="px-2 text-muted-foreground"
          style={{ fontSize: "10px", padding: "2px 8px", borderBottom: `0.5px solid ${borderWeak}` }}
        >
          AFTER
        </div>

        {/* Rows */}
        {rows.map((row, i) => {
          if (row.type === "hunk") {
            return (
              <div
                key={i}
                className="oac-diff-hunk"
                style={{ gridColumn: "1 / -1", padding: "2px 8px", fontStyle: "italic" }}
              >
                {row.hunkContent}
              </div>
            )
          }

          const { left, right } = row
          const leftCls = left?.type === "del" ? "oac-diff-del" : ""
          const rightCls = right?.type === "add" ? "oac-diff-add" : ""

          return (
            <React.Fragment key={i}>
              {/* Left cell (before) */}
              <div className={`oac-diff-line ${leftCls}`} style={{ borderRight: `0.5px solid ${borderWeak}` }}>
                {left ? (
                  <>
                    <span className="oac-diff-gutter">{left.oldNum ?? ""}</span>
                    <span className="oac-diff-sign">{left.type === "del" ? "-" : " "}</span>
                    <span className="oac-diff-content">{left.content}</span>
                  </>
                ) : (
                  <span className="oac-diff-gutter" />
                )}
              </div>
              {/* Right cell (after) */}
              <div className={`oac-diff-line ${rightCls}`}>
                {right ? (
                  <>
                    <span className="oac-diff-gutter">{right.newNum ?? ""}</span>
                    <span className="oac-diff-sign">{right.type === "add" ? "+" : " "}</span>
                    <span className="oac-diff-content">{right.content}</span>
                  </>
                ) : (
                  <span className="oac-diff-gutter" />
                )}
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface ToolDiffViewProps {
  diff: FileDiff
  /** When true, disables collapse — always shows full diff. Use in modal. */
  forceExpanded?: boolean
}

export function ToolDiffView({ diff, forceExpanded = false }: ToolDiffViewProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [wide, setWide] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Detect container width for responsive layout switch
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWide(entry.contentRect.width >= 540)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const allLines = useMemo(
    () => computeDiffLines(diff.before ?? "", diff.after, diff.path),
    [diff.before, diff.after, diff.path],
  )

  // Collapse threshold based on source file size, not diff line count
  const totalSourceLines = Math.max(
    diff.before ? diff.before.split("\n").length : 0,
    diff.after.split("\n").length,
  )
  const needsCollapse = totalSourceLines > PREVIEW_LINES && !forceExpanded
  const showFull = !needsCollapse || isExpanded
  const visibleLines = showFull ? allLines : slicePreview(allLines, PREVIEW_LINES)
  const hiddenCount = totalSourceLines - PREVIEW_LINES

  // Side-by-side only when before content exists (write tool has no before)
  const useSideBySide = wide && diff.before !== undefined
  const sideBySideRows = useMemo(
    () => (useSideBySide ? buildSideBySideRows(visibleLines) : []),
    [useSideBySide, visibleLines],
  )

  return (
    <div ref={containerRef}>
      {useSideBySide
        ? <SideBySideDiff rows={sideBySideRows} />
        : <UnifiedDiff lines={visibleLines} />
      }
      {needsCollapse && !isExpanded && (
        <button
          type="button"
          className="flex items-center gap-1 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          style={{ borderTop: "0.5px solid var(--border-weak)" }}
          onClick={() => setIsExpanded(true)}
        >
          + {hiddenCount} more lines ↕
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/components/chat/blocks/tool-diff-view.tsx
git commit -m "feat: add ToolDiffView component with unified and side-by-side layouts"
```

---

### Task 5: Integrate `ToolDiffView` into `tool-block.tsx`

**Files:**
- Modify: `src/openacp/components/chat/blocks/tool-block.tsx`

Replace IN/OUT rendering with `ToolDiffView` when `kind` is `edit` or `write` and `block.diff` is available. Other tool kinds keep the existing IN/OUT display. The modal also uses `ToolDiffView` (with `forceExpanded`) for diff tools.

- [ ] **Step 1: Add import**

At the top of `src/openacp/components/chat/blocks/tool-block.tsx`, add:

```ts
import { ToolDiffView } from "./tool-diff-view"
```

- [ ] **Step 2: Replace the body of `ToolBlockView`**

The current component renders the same IN/OUT grid for all tool kinds. Replace the full component with this version that branches on `kind` and `block.diff`:

```tsx
export const ToolBlockView = memo(function ToolBlockView({ block, feedbackReason }: ToolBlockProps) {
  const { shouldAutoExpand } = useToolDisplay()
  const [expanded, setExpanded] = useState(() => shouldAutoExpand(block.kind))
  const [modalOpen, setModalOpen] = useState(false)
  const isPending = block.status === "pending" || block.status === "running"
  const isRejected = isRejectionOutput(block.output)

  const icon = useMemo(() => kindIcon(block.kind), [block.kind])
  const label = useMemo(() => kindLabel(block.kind), [block.kind])
  const inputText = useMemo(() => formatToolInput(block.input), [block.input])
  const truncatedInput = useMemo(
    () => (inputText ? truncateLines(inputText, MAX_VISIBLE_LINES) : null),
    [inputText]
  )
  const truncatedOutput = useMemo(
    () => (block.output && !isRejected ? truncateLines(block.output, MAX_VISIBLE_LINES) : null),
    [block.output, isRejected]
  )
  const reason = feedbackReason && isRejected ? feedbackReason : undefined

  // Use diff view for edit/write when diff data is available
  const isDiffKind = block.kind === "edit" || block.kind === "write"
  const hasDiff = isDiffKind && block.diff != null

  const hasBody = hasDiff || !!inputText || (!!block.output && !isRejected) || !!reason

  return (
    <div>
      <div
        className={`oac-tool-card-title${isPending ? " oac-tool-card-shimmer" : ""}`}
        onClick={() => hasBody && setExpanded(!expanded)}
      >
        <span className="shrink-0">{icon}</span>
        <span className="shrink-0" style={{ fontWeight: "500" }}>{label}</span>
        <span
          className="truncate min-w-0 hover:underline cursor-pointer"
          style={{ color: isRejected ? "var(--text-critical-base, #dc2626)" : "var(--muted-foreground)" }}
          onClick={(e) => {
            e.stopPropagation()
            const filePath = block.input?.file_path ?? block.input?.filePath ?? block.input?.path
            if (typeof filePath === "string" && filePath) {
              window.dispatchEvent(new CustomEvent("open-file-in-review", { detail: { path: filePath } }))
            }
          }}
          title={block.title}
        >
          {block.title}
        </span>
        {isRejected && (
          <span className="text-2xs-regular" style={{ color: "var(--text-critical-base, #dc2626)" }}>
            rejected
          </span>
        )}
        {block.diffStats && !isRejected && (
          <>
            {block.diffStats.added > 0 && (
              <span className="oac-diff-stat-add">+{block.diffStats.added}</span>
            )}
            {block.diffStats.removed > 0 && (
              <span className="oac-diff-stat-del">-{block.diffStats.removed}</span>
            )}
          </>
        )}
        {hasBody && !isPending && (
          <CaretRight
            size={10}
            className="shrink-0 text-muted-foreground transition-transform duration-150"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          />
        )}
      </div>

      {reason && (
        <div className="oac-tool-card-collapse oac-tool-card-collapse--open">
          <div className="oac-tool-card-body">
            <div className="flex items-center gap-1.5 text-sm-regular" style={{ color: "var(--text-critical-base, #dc2626)" }}>
              <span style={{ fontWeight: 500 }}>Reason:</span>
              <span style={{ color: "var(--foreground-weak)" }}>{reason}</span>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {hasBody && !reason && expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="oac-tool-card-body relative group/toolbody">
              {/* Diff view for edit/write tools */}
              {hasDiff ? (
                <>
                  <button
                    type="button"
                    className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover/toolbody:opacity-100 hover:bg-accent transition-opacity z-10"
                    title="Expand"
                    onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
                  >
                    <ArrowsOut size={12} className="text-muted-foreground" />
                  </button>
                  <ToolDiffView diff={block.diff!} />
                </>
              ) : (
                /* Fallback: IN/OUT grid for other tools or when diff unavailable */
                <>
                  <button
                    type="button"
                    className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover/toolbody:opacity-100 hover:bg-accent transition-opacity z-10"
                    title="Expand"
                    onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
                  >
                    <ArrowsOut size={12} className="text-muted-foreground" />
                  </button>
                  <div className="oac-tool-card-grid">
                    {truncatedInput && (
                      <div className="oac-tool-card-row">
                        <div className="oac-tool-card-row-label">IN</div>
                        <div className="oac-tool-card-row-content">
                          {truncatedInput.visible}
                          {truncatedInput.hiddenCount > 0 && (
                            <button
                              type="button"
                              className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
                            >
                              + {truncatedInput.hiddenCount} more lines <ArrowsOut size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {truncatedOutput && (
                      <div className="oac-tool-card-row">
                        <div className="oac-tool-card-row-label">OUT</div>
                        <div className="oac-tool-card-row-content">
                          {truncatedOutput.visible}
                          {truncatedOutput.hiddenCount > 0 && (
                            <button
                              type="button"
                              className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
                            >
                              + {truncatedOutput.hiddenCount} more lines <ArrowsOut size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col [backface-visibility:hidden]">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 text-sm min-w-0">
              <span className="shrink-0">{icon}</span>
              <span className="shrink-0">{label}</span>
              <span className="text-muted-foreground font-normal truncate">{block.title}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {hasDiff ? (
              /* Full diff view in modal — forceExpanded disables the 10-line collapse */
              <div className="border border-border-weak rounded-md overflow-hidden">
                <ToolDiffView diff={block.diff!} forceExpanded />
              </div>
            ) : (
              /* IN/OUT grid for non-diff tools */
              <div className="oac-tool-card-grid border border-border-weak rounded-md overflow-hidden">
                {inputText && (
                  <div className="oac-tool-card-row">
                    <div className="oac-tool-card-row-label">IN</div>
                    <div className="oac-tool-card-row-content oac-tool-card-row-content--expanded select-text">{inputText}</div>
                  </div>
                )}
                {block.output && !isRejected && (
                  <div className="oac-tool-card-row">
                    <div className="oac-tool-card-row-label">OUT</div>
                    <div className="oac-tool-card-row-content oac-tool-card-row-content--expanded select-text">{block.output}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Smoke test in the app**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App && pnpm dev
```

Open a session that has run an `edit` tool call. Verify:
- Edit tool shows diff view instead of IN/OUT
- If file > 10 lines: preview + expand button visible
- Expand button works inline
- ArrowsOut opens modal with full diff, no collapse
- Non-edit tools still show IN/OUT
- Write tool (new file): unified view only, all lines green

- [ ] **Step 5: Commit**

```bash
cd /Users/lucas/code/openacp-workspace/OpenACP-App
git add src/openacp/components/chat/blocks/tool-block.tsx
git commit -m "feat: show diff view for edit and write tool blocks"
```
