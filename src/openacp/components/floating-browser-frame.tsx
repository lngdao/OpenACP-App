import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ArrowClockwise, ArrowsInSimple, X } from "@phosphor-icons/react"
import { Button } from "./ui/button"
import { useBrowserPanel } from "../context/browser-panel"

/**
 * In-app floating browser — a mini player hosted inside the main window's
 * bottom-right corner. The native child webview is positioned underneath the
 * HTML chrome strip via bounds computed from `webviewAreaRef`, so the chrome
 * (reload/dock/close buttons) is visible HTML above the webview's native layer.
 *
 * Only rendered when `browser.mode === "floating" && browser.isVisible`.
 */
const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 268 // 28px chrome + 240px webview
const CHROME_HEIGHT = 28
const MARGIN = 24

export function FloatingBrowserFrame() {
  const browser = useBrowserPanel()
  const webviewAreaRef = useRef<HTMLDivElement>(null)

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

  useLayoutEffect(() => {
    if (browser.mode !== "floating" || !browser.isVisible) return
    syncBounds()
  }, [browser.mode, browser.isVisible, syncBounds])

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

  if (browser.mode !== "floating" || !browser.isVisible) return null

  const handleDock = () => void browser.setMode("docked")
  const handleReload = () => void browser.reload()
  const handleClose = () => void browser.close()

  return (
    <div
      className="fixed bg-background border border-border-weak rounded-lg shadow-2xl overflow-hidden z-50 flex flex-col"
      style={{
        right: MARGIN,
        bottom: MARGIN,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
      }}
    >
      {/* Chrome strip — HTML, visible above the native webview area */}
      <div
        className="shrink-0 flex items-center gap-1 px-2 border-b border-border-weak bg-card select-none"
        style={{ height: CHROME_HEIGHT }}
      >
        <div className="flex-1 text-[10px] text-muted-foreground truncate font-mono px-1">
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
      {/* Webview area — transparent HTML div, the native webview is positioned
          on top of this region by syncBounds(). */}
      <div ref={webviewAreaRef} className="flex-1 min-h-0" />
    </div>
  )
}
