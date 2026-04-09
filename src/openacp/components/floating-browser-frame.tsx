import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ArrowClockwise, ArrowsInSimple, X } from "@phosphor-icons/react"
import { Button } from "./ui/button"
import { useBrowserPanel } from "../context/browser-panel"

/**
 * In-app floating browser — a mini player hosted inside the main window.
 * Starts at the bottom-right corner and is both **draggable** (via the chrome
 * strip) and **resizable** (via the bottom-right corner handle). The native
 * child webview is positioned beneath the HTML chrome strip using bounds
 * computed from `webviewAreaRef` after every layout change.
 *
 * Only rendered when `browser.mode === "floating" && browser.isVisible`.
 */
const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 268 // 28px chrome + 240px webview
const CHROME_HEIGHT = 28
const MIN_WIDTH = 280
const MIN_HEIGHT = 180
const MAX_WIDTH = 900
const MAX_HEIGHT = 700
const MARGIN = 24

export function FloatingBrowserFrame() {
  const browser = useBrowserPanel()
  const frameRef = useRef<HTMLDivElement>(null)
  const webviewAreaRef = useRef<HTMLDivElement>(null)

  // null position → pin to bottom-right default. Any drag materializes it
  // into an absolute {x,y} pair.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT })
  const [isInteracting, setIsInteracting] = useState(false)

  const syncBounds = useCallback(() => {
    const el = webviewAreaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width < 10 || rect.height < 10) return
    invoke("browser_set_mode", {
      mode: "floating",
      bounds: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
    }).catch(() => {})
  }, [])

  // Sync bounds whenever layout settles (mode switch, visibility, pos/size
  // change, interaction end). Skipped while interacting so the native webview
  // doesn't chase the HTML frame on every frame (it's suppressed then).
  useLayoutEffect(() => {
    if (browser.mode !== "floating" || !browser.isVisible) return
    if (isInteracting) return
    syncBounds()
  }, [browser.mode, browser.isVisible, isInteracting, pos, size, syncBounds])

  // Window resize: re-sync when the user resizes the main window (default
  // bottom-right positioning shifts with the window size).
  useEffect(() => {
    if (browser.mode !== "floating" || !browser.isVisible) return
    let raf: number | null = null
    function onResize() {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        syncBounds()
        raf = null
      })
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [browser.mode, browser.isVisible, syncBounds])

  const clampPos = useCallback(
    (x: number, y: number, w: number, h: number) => ({
      x: Math.max(0, Math.min(window.innerWidth - w, x)),
      y: Math.max(0, Math.min(window.innerHeight - h, y)),
    }),
    [],
  )

  const beginInteraction = useCallback(async () => {
    setIsInteracting(true)
    try {
      await invoke("browser_suppress")
    } catch {
      // ignore
    }
  }, [])

  const endInteraction = useCallback(async () => {
    // Sync bounds to final position BEFORE unsuppressing so the webview
    // reappears at the new spot rather than flashing at the old one.
    const el = webviewAreaRef.current
    if (el) {
      const rect = el.getBoundingClientRect()
      if (rect.width >= 10 && rect.height >= 10) {
        try {
          await invoke("browser_set_mode", {
            mode: "floating",
            bounds: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            },
          })
        } catch {
          // ignore
        }
      }
    }
    try {
      await invoke("browser_unsuppress")
    } catch {
      // ignore
    }
    setIsInteracting(false)
  }, [])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      // Ignore drags initiated on buttons within the chrome
      if ((e.target as HTMLElement).closest("button")) return
      e.preventDefault()

      const el = frameRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const startX = rect.left
      const startY = rect.top
      const startMouseX = e.clientX
      const startMouseY = e.clientY

      void beginInteraction()
      // Lock pos to current bounding rect so the frame stops following the
      // bottom-right default during the drag.
      setPos({ x: startX, y: startY })

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouseX
        const dy = ev.clientY - startMouseY
        setPos(clampPos(startX + dx, startY + dy, size.w, size.h))
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        void endInteraction()
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [size.w, size.h, clampPos, beginInteraction, endInteraction],
  )

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const el = frameRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const startX = rect.left
      const startY = rect.top
      const startW = size.w
      const startH = size.h
      const startMouseX = e.clientX
      const startMouseY = e.clientY

      // Materialize pos so resizing doesn't fight the bottom-right default.
      setPos({ x: startX, y: startY })
      void beginInteraction()

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startMouseX
        const dy = ev.clientY - startMouseY
        const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + dx))
        const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH + dy))
        setSize({ w: newW, h: newH })
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        void endInteraction()
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [size.w, size.h, beginInteraction, endInteraction],
  )

  if (browser.mode !== "floating" || !browser.isVisible) return null

  const handleDock = () => void browser.setMode("docked")
  const handleReload = () => void browser.reload()
  const handleClose = () => void browser.close()

  const frameStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, width: size.w, height: size.h }
    : { right: MARGIN, bottom: MARGIN, width: size.w, height: size.h }

  return (
    <div
      ref={frameRef}
      className="fixed bg-background border border-border-weak rounded-lg shadow-2xl overflow-hidden z-50 flex flex-col"
      style={frameStyle}
    >
      {/* Chrome strip — HTML, visible above the native webview. Acts as drag
          handle (mousedown anywhere except buttons starts a drag). */}
      <div
        className="shrink-0 flex items-center gap-1 px-2 border-b border-border-weak bg-card select-none cursor-move"
        style={{ height: CHROME_HEIGHT }}
        onMouseDown={handleDragStart}
      >
        <div className="flex-1 text-[10px] text-muted-foreground truncate font-mono px-1 pointer-events-none">
          {browser.url ?? "Floating browser"}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleReload} title="Reload">
          <ArrowClockwise size={12} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleDock} title="Dock">
          <ArrowsInSimple size={12} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={handleClose} title="Close">
          <X size={12} />
        </Button>
      </div>

      {/* Webview area — transparent HTML div, native webview is positioned
          on top of this region via syncBounds(). Shows a placeholder while
          interacting (drag/resize) since the webview is suppressed then. */}
      <div ref={webviewAreaRef} className="flex-1 min-h-0 relative">
        {isInteracting && (
          <div className="absolute inset-0 bg-muted/40 border-t border-dashed border-border-weak flex items-center justify-center">
            <div className="text-xs text-muted-foreground">
              {"Updating…"}
            </div>
          </div>
        )}
      </div>

      {/* Bottom-right resize handle */}
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
        onMouseDown={handleResizeStart}
        title="Resize"
        style={{
          background:
            "linear-gradient(135deg, transparent 50%, var(--border) 50%, var(--border) 60%, transparent 60%, transparent 70%, var(--border) 70%, var(--border) 80%, transparent 80%)",
        }}
      />
    </div>
  )
}
