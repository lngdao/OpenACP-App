import { useEffect, useMemo, useRef, useState } from "react"
import { computeDiffLines, slicePreview } from "../diff-utils"
import type { FileDiff } from "../../../types"

const PREVIEW_LINES = 10

interface ToolDiffViewProps {
  diff: FileDiff
  /** When true, disables collapse — always shows full diff. Use in modal. */
  forceExpanded?: boolean
}

export function ToolDiffView({ diff, forceExpanded = false }: ToolDiffViewProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)
  // Ref on the scroll container (parent of the table), not the table itself
  const scrollRef = useRef<HTMLDivElement>(null)

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

  // Track horizontal overflow to show/hide the right fade gradient
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setHasOverflow(el.scrollWidth > el.clientWidth + el.scrollLeft + 1)
    check()
    el.addEventListener("scroll", check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => { el.removeEventListener("scroll", check); ro.disconnect() }
  }, [visibleLines])

  return (
    <div>
      <div className="relative">
        {/* Scroll container — overflow-x here; .oac-diff-view inside is display:table */}
        <div ref={scrollRef} className="font-mono overflow-x-auto no-scrollbar text-xs">
          <div className="oac-diff-view">
            {visibleLines.map((line, i) => (
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
        </div>
        {hasOverflow && (
          <div
            className="absolute top-0 right-0 bottom-0 w-12 pointer-events-none"
            style={{ background: "linear-gradient(to left, var(--card), transparent)" }}
          />
        )}
      </div>
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
