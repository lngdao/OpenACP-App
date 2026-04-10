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
    <div className="oac-diff-view font-mono overflow-x-auto no-scrollbar text-xs">
      {lines.map((line, i) => (
        <div
          key={`${line.type}-${line.oldNum ?? "x"}-${line.newNum ?? "x"}-${i}`}
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
    <div className="font-mono overflow-x-auto no-scrollbar text-xs">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {/* Column headers */}
        <div
          className="text-muted-foreground text-[10px] py-0.5 px-2"
          style={{ borderBottom: `0.5px solid ${borderWeak}`, borderRight: `0.5px solid ${borderWeak}` }}
        >
          BEFORE
        </div>
        <div
          className="text-muted-foreground text-[10px] py-0.5 px-2"
          style={{ borderBottom: `0.5px solid ${borderWeak}` }}
        >
          AFTER
        </div>

        {/* Rows */}
        {rows.map((row, i) => {
          if (row.type === "hunk") {
            return (
              <div
                key={`hunk-${i}`}
                className="oac-diff-hunk py-0.5 px-2 italic"
                style={{ gridColumn: "1 / -1" }}
              >
                {row.hunkContent}
              </div>
            )
          }

          const { left, right } = row
          const leftCls = left?.type === "del" ? "oac-diff-del" : ""
          const rightCls = right?.type === "add" ? "oac-diff-add" : ""

          return (
            <React.Fragment key={`pair-${row.left?.oldNum ?? "x"}-${row.right?.newNum ?? "x"}-${i}`}>
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
