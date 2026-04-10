# Tool Call Visibility Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add settings to control which tool call kinds auto-expand their IN/OUT body, with preset shortcuts and per-kind toggles, plus fix thinking blocks not collapsing after streaming.

**Architecture:** A new `ToolDisplayContext` holds `toolAutoExpand: Record<string, boolean>` loaded from Tauri's settings store. `ToolBlockView` reads initial expanded state from this context at mount time. `SettingsAppearance` exposes preset tabs + per-kind switches that write through the context.

**Tech Stack:** React 19, Tauri plugin-store (`@tauri-apps/plugin-store`), shadcn/ui (`Tabs`, `Switch`), `@phosphor-icons/react`

---

### Task 1: Fix thinking block auto-collapse

**Files:**
- Modify: `src/openacp/components/chat/blocks/thinking-block.tsx:16-18`

- [ ] **Step 1: Fix the useEffect to collapse when streaming ends**

Open `src/openacp/components/chat/blocks/thinking-block.tsx` and replace:

```typescript
  // Auto-open when a new streaming session starts
  useEffect(() => {
    if (block.isStreaming) setOpen(true)
  }, [block.isStreaming])
```

with:

```typescript
  // Open while streaming so content is visible as it arrives; collapse when done.
  useEffect(() => {
    setOpen(block.isStreaming)
  }, [block.isStreaming])
```

- [ ] **Step 2: Verify manually**

Run `pnpm tauri dev`, start a session that triggers thinking. Confirm:
- Thinking block opens automatically during streaming
- Thinking block collapses automatically when streaming finishes
- Clicking the summary toggle still works

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/chat/blocks/thinking-block.tsx
git commit -m "fix: auto-collapse thinking block when streaming ends"
```

---

### Task 2: Add `toolAutoExpand` to settings store

**Files:**
- Modify: `src/openacp/lib/settings-store.ts`

- [ ] **Step 1: Update `AppSettings`, defaults, and `getAllSettings`**

Replace the entire contents of `src/openacp/lib/settings-store.ts` with:

```typescript
import { load } from "@tauri-apps/plugin-store"

const STORE_NAME = "settings.json"

export interface AppSettings {
  theme: "dark" | "light" | "system"
  fontSize: "small" | "medium" | "large"
  language: string
  devMode: boolean
  browserPanel: boolean
  browserLastMode: "docked" | "floating" | "pip"
  browserSearchEngine: "google" | "duckduckgo" | "bing"
  toolAutoExpand: Record<string, boolean>
}

const defaults: AppSettings = {
  theme: "dark",
  fontSize: "medium",
  language: "en",
  devMode: false,
  browserPanel: false,
  browserLastMode: "docked",
  browserSearchEngine: "google",
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
  },
}

let store: Awaited<ReturnType<typeof load>> | null = null

async function getStore() {
  if (!store) store = await load(STORE_NAME, { autoSave: true })
  return store
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const s = await getStore()
  return ((await s.get(key)) as AppSettings[K]) ?? defaults[key]
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  const s = await getStore()
  await s.set(key, value)
}

export async function getAllSettings(): Promise<AppSettings> {
  const s = await getStore()
  const theme = ((await s.get("theme")) as AppSettings["theme"]) ?? defaults.theme
  const fontSize = ((await s.get("fontSize")) as AppSettings["fontSize"]) ?? defaults.fontSize
  const language = ((await s.get("language")) as AppSettings["language"]) ?? defaults.language
  const devMode = ((await s.get("devMode")) as AppSettings["devMode"]) ?? defaults.devMode
  const browserPanel = ((await s.get("browserPanel")) as AppSettings["browserPanel"]) ?? defaults.browserPanel
  const browserLastMode =
    ((await s.get("browserLastMode")) as AppSettings["browserLastMode"]) ?? defaults.browserLastMode
  const browserSearchEngine =
    ((await s.get("browserSearchEngine")) as AppSettings["browserSearchEngine"]) ?? defaults.browserSearchEngine
  const toolAutoExpand =
    ((await s.get("toolAutoExpand")) as AppSettings["toolAutoExpand"]) ?? defaults.toolAutoExpand
  return { theme, fontSize, language, devMode, browserPanel, browserLastMode, browserSearchEngine, toolAutoExpand }
}

/** Apply theme to document element */
export function applyTheme(theme: AppSettings["theme"]) {
  const root = document.documentElement
  if (theme === "system") {
    root.removeAttribute("data-theme")
  } else {
    root.setAttribute("data-theme", theme)
  }
}

/** Apply font size scaling to html root — scales entire UI proportionally (text, icons, spacing).
 *  All rem-based values in Tailwind scale with this, acting as a UI zoom level. */
export function applyFontSize(fontSize: AppSettings["fontSize"]) {
  const root = document.documentElement
  root.removeAttribute("data-font-size")
  root.setAttribute("data-font-size", fontSize)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/lib/settings-store.ts
git commit -m "feat: add toolAutoExpand field to AppSettings"
```

---

### Task 3: Create ToolDisplayContext

**Files:**
- Create: `src/openacp/context/tool-display.tsx`

- [ ] **Step 1: Create the context file**

Create `src/openacp/context/tool-display.tsx`:

```typescript
import React, { createContext, useContext, useEffect, useState } from "react"
import { getSetting, setSetting } from "../lib/settings-store"

const ALL_KINDS = ["read", "search", "edit", "write", "execute", "agent", "web", "skill", "other"] as const

/**
 * Preset configurations for tool auto-expand.
 * "important" expands only high-impact tool kinds; "all" expands everything; "none" collapses all.
 */
export const TOOL_EXPAND_PRESETS: Record<"all" | "important" | "none", Record<string, boolean>> = {
  all: Object.fromEntries(ALL_KINDS.map((k) => [k, true])),
  important: {
    read: false,
    search: false,
    edit: true,
    write: true,
    execute: true,
    agent: true,
    web: false,
    skill: false,
    other: false,
  },
  none: Object.fromEntries(ALL_KINDS.map((k) => [k, false])),
}

/**
 * Returns the matching preset name if the value exactly matches one of the three presets,
 * or null if it is a custom configuration.
 */
export function detectPreset(value: Record<string, boolean>): "all" | "important" | "none" | null {
  for (const [name, preset] of Object.entries(TOOL_EXPAND_PRESETS) as ["all" | "important" | "none", Record<string, boolean>][]) {
    if (ALL_KINDS.every((k) => value[k] === preset[k])) return name
  }
  return null
}

interface ToolDisplayContextValue {
  /** Current per-kind auto-expand map */
  toolAutoExpand: Record<string, boolean>
  /** Returns true if a tool of the given kind should auto-expand its IN/OUT body on mount */
  shouldAutoExpand: (kind: string) => boolean
  /** Writes new value to both React state and the persistent settings store */
  updateToolAutoExpand: (value: Record<string, boolean>) => Promise<void>
}

const ToolDisplayContext = createContext<ToolDisplayContextValue>({
  toolAutoExpand: TOOL_EXPAND_PRESETS.important,
  shouldAutoExpand: (kind) => TOOL_EXPAND_PRESETS.important[kind] ?? false,
  updateToolAutoExpand: async () => {},
})

export function ToolDisplayProvider({ children }: { children: React.ReactNode }) {
  const [toolAutoExpand, setToolAutoExpand] = useState<Record<string, boolean>>(TOOL_EXPAND_PRESETS.important)

  useEffect(() => {
    void getSetting("toolAutoExpand").then(setToolAutoExpand)
  }, [])

  async function updateToolAutoExpand(value: Record<string, boolean>) {
    setToolAutoExpand(value)
    await setSetting("toolAutoExpand", value)
  }

  return (
    <ToolDisplayContext.Provider
      value={{
        toolAutoExpand,
        shouldAutoExpand: (kind) => toolAutoExpand[kind] ?? false,
        updateToolAutoExpand,
      }}
    >
      {children}
    </ToolDisplayContext.Provider>
  )
}

/** Hook to access tool display settings and updater from any component in the tree. */
export function useToolDisplay() {
  return useContext(ToolDisplayContext)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/context/tool-display.tsx
git commit -m "feat: add ToolDisplayContext for tool auto-expand settings"
```

---

### Task 4: Wire ToolDisplayProvider in app root

**Files:**
- Modify: `src/openacp/app.tsx`

- [ ] **Step 1: Add import**

At the top of `src/openacp/app.tsx`, add alongside the other context imports:

```typescript
import { ToolDisplayProvider } from "./context/tool-display"
```

- [ ] **Step 2: Wrap OpenACPApp with ToolDisplayProvider**

Find the `OpenACPApp` function (around line 238) and replace it:

```typescript
export function OpenACPApp() {
  return (
    <ToolDisplayProvider>
      <BrowserOverlayProvider>
        <BrowserPanelProvider>
          <OpenACPAppInner />
          <FloatingBrowserFrame />
        </BrowserPanelProvider>
      </BrowserOverlayProvider>
    </ToolDisplayProvider>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/app.tsx
git commit -m "feat: wrap app root with ToolDisplayProvider"
```

---

### Task 5: Update ToolBlockView to read initial expanded state from context

**Files:**
- Modify: `src/openacp/components/chat/blocks/tool-block.tsx`

- [ ] **Step 1: Add import**

At the top of `src/openacp/components/chat/blocks/tool-block.tsx`, add:

```typescript
import { useToolDisplay } from "../../../context/tool-display"
```

- [ ] **Step 2: Replace hardcoded expanded state**

Inside `ToolBlockView`, replace:

```typescript
  const [expanded, setExpanded] = useState(true)
```

with:

```typescript
  const { shouldAutoExpand } = useToolDisplay()
  // useState initializer only runs once at mount — existing blocks keep their state when settings change
  const [expanded, setExpanded] = useState(() => shouldAutoExpand(block.kind))
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 4: Verify manually**

Run `pnpm tauri dev`. Open a conversation with tool calls. Confirm:
- Read/Search/Web/Skill/Other tool cards render collapsed (header visible, no IN/OUT body)
- Edit/Write/Bash/Agent tool cards render expanded (IN/OUT body visible)
- Clicking any tool card header still toggles expand/collapse

- [ ] **Step 5: Commit**

```bash
git add src/openacp/components/chat/blocks/tool-block.tsx
git commit -m "feat: use ToolDisplayContext for tool block initial expanded state"
```

---

### Task 6: Add Tool Calls settings UI

**Files:**
- Modify: `src/openacp/components/settings/settings-appearance.tsx`

- [ ] **Step 1: Replace the file with the updated version**

Replace the entire contents of `src/openacp/components/settings/settings-appearance.tsx`:

```typescript
import React, { useEffect, useState } from "react"
import { getSetting, setSetting, applyTheme, applyFontSize, type AppSettings } from "../../lib/settings-store"
import { useToolDisplay, TOOL_EXPAND_PRESETS, detectPreset } from "../../context/tool-display"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs"
import { Switch } from "../ui/switch"

const TOOL_KIND_LABELS: Record<string, string> = {
  read: "Read",
  search: "Search",
  edit: "Edit",
  write: "Write",
  execute: "Bash",
  agent: "Agent",
  web: "Web",
  skill: "Skill",
  other: "Other",
}

const TOOL_KINDS = Object.keys(TOOL_KIND_LABELS)

export function SettingsAppearance() {
  const [theme, setTheme] = useState<AppSettings["theme"]>("dark")
  const [fontSize, setFontSize] = useState<AppSettings["fontSize"]>("medium")
  const { toolAutoExpand, updateToolAutoExpand } = useToolDisplay()

  useEffect(() => {
    void getSetting("theme").then(setTheme)
    void getSetting("fontSize").then(setFontSize)
  }, [])

  async function handleThemeChange(value: AppSettings["theme"]) {
    setTheme(value)
    await setSetting("theme", value)
    applyTheme(value)
  }

  async function handleFontSizeChange(value: AppSettings["fontSize"]) {
    setFontSize(value)
    await setSetting("fontSize", value)
    applyFontSize(value)
  }

  async function handlePresetChange(preset: "all" | "important" | "none") {
    await updateToolAutoExpand(TOOL_EXPAND_PRESETS[preset])
  }

  async function handleKindToggle(kind: string, value: boolean) {
    await updateToolAutoExpand({ ...toolAutoExpand, [kind]: value })
  }

  const activePreset = detectPreset(toolAutoExpand)

  return (
    <div className="flex flex-col gap-6">
      <SettingCard title="Theme">
        <SettingRow label="Color scheme" description="Choose light, dark, or system theme">
          <Tabs value={theme} onValueChange={(v) => void handleThemeChange(v as AppSettings["theme"])}>
            <TabsList>
              <TabsTrigger value="light">Light</TabsTrigger>
              <TabsTrigger value="dark">Dark</TabsTrigger>
              <TabsTrigger value="system">System</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingRow>
      </SettingCard>

      <SettingCard title="Typography">
        <SettingRow label="Font size" description="Adjust the interface font size">
          <Tabs value={fontSize} onValueChange={(v) => void handleFontSizeChange(v as AppSettings["fontSize"])}>
            <TabsList>
              <TabsTrigger value="small">Small</TabsTrigger>
              <TabsTrigger value="medium">Medium</TabsTrigger>
              <TabsTrigger value="large">Large</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingRow>
      </SettingCard>

      <SettingCard title="Tool Calls">
        <SettingRow
          label="Auto-expand detail"
          description="Controls which tool calls show IN/OUT details by default"
        >
          {/* activePreset is null when a custom mix is set — Tabs renders no active tab in that case */}
          <Tabs
            value={activePreset ?? ""}
            onValueChange={(v) => void handlePresetChange(v as "all" | "important" | "none")}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="important">Important</TabsTrigger>
              <TabsTrigger value="none">None</TabsTrigger>
            </TabsList>
          </Tabs>
        </SettingRow>
        {TOOL_KINDS.map((kind) => (
          <SettingRow key={kind} label={TOOL_KIND_LABELS[kind]} description="">
            <Switch
              checked={toolAutoExpand[kind] ?? false}
              onCheckedChange={(v) => void handleKindToggle(kind, v)}
            />
          </SettingRow>
        ))}
      </SettingCard>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 3: Verify UI manually**

Run `pnpm tauri dev`, open Settings → Appearance. Confirm:
- "Tool Calls" card appears below Typography
- "Important" preset tab is active by default (edit/write/execute/agent switches ON, rest OFF)
- Clicking "All" turns all switches ON
- Clicking "None" turns all switches OFF
- Toggling an individual switch deactivates the preset tabs (no tab highlighted)
- Re-opening settings shows the saved state after toggle

- [ ] **Step 4: Commit**

```bash
git add src/openacp/components/settings/settings-appearance.tsx
git commit -m "feat: add Tool Calls settings with preset tabs and per-kind switches"
```
