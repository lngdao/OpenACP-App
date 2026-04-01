import { createSignal, createEffect, on, onCleanup, Show, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { WorkspaceProvider, resolveWorkspaceServer } from "./context/workspace"
import { SessionsProvider } from "./context/sessions"
import { ChatProvider } from "./context/chat"
import { SidebarPanel } from "./components/sidebar"
import { SidebarRail } from "./components/sidebar-rail"
import { ChatView } from "./components/chat-view"
import { Composer } from "./components/composer"
import { WelcomeScreen } from "./components/welcome"
import { loadWorkspaceData, saveWorkspaceData } from "./api/workspace-store"
import { useChat } from "./context/chat"
import { Toast } from "../ui/src/components/toast"
import type { ServerInfo } from "./types"

function ChatArea() {
  const chat = useChat()
  return (
    <div class="@container relative flex-1 flex flex-col min-h-0 h-full bg-background-stronger min-w-0">
      <ChatView />
      <Show when={chat.activeSession()}>
        <Composer />
      </Show>
    </div>
  )
}

export function OpenACPApp() {
  const [store, setStore] = createStore({
    workspaces: [] as string[],
    active: null as string | null,
    ready: false, // true after initial load from store
  })

  const [server, setServer] = createSignal<ServerInfo | null>(null)
  const [serverLoading, setServerLoading] = createSignal(false)
  const [serverError, setServerError] = createSignal(false)

  // ── Workspace persistence ───────────────────────────────────────────────

  // Load persisted workspaces on mount
  void loadWorkspaceData().then(async (data) => {
    if (data.workspaces.length > 0) {
      setStore("workspaces", data.workspaces)
    }
    if (data.lastActive && data.workspaces.includes(data.lastActive)) {
      setStore("active", data.lastActive)
    }
    setStore("ready", true)
  })

  function persistWorkspaces() {
    void saveWorkspaceData({
      workspaces: store.workspaces,
      lastActive: store.active,
    })
  }

  function addWorkspace(directory: string) {
    if (store.workspaces.includes(directory)) {
      setStore("active", directory)
    } else {
      setStore("workspaces", (prev) => [...prev, directory])
      setStore("active", directory)
    }
    persistWorkspaces()
  }

  function switchWorkspace(directory: string) {
    setStore("active", directory)
    persistWorkspaces()
  }

  function removeWorkspace(directory: string) {
    setStore("workspaces", (prev) => prev.filter((d) => d !== directory))
    if (store.active === directory) {
      setStore("active", store.workspaces[0] ?? null)
    }
    persistWorkspaces()
  }

  async function openFolderPicker() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const selected = await open({ directory: true, multiple: false })
      if (selected && typeof selected === "string") {
        addWorkspace(selected)
      }
    } catch (e) {
      console.error("[openFolder] failed", e)
      const dir = window.prompt("Enter workspace directory path:")
      if (dir) addWorkspace(dir)
    }
  }

  // ── Server connection with auto-retry ───────────────────────────────────

  let retryTimer: ReturnType<typeof setInterval> | undefined
  let retryCount = 0
  const MAX_RETRY_INTERVAL = 10_000
  const BASE_RETRY_INTERVAL = 3_000

  async function resolveServer(dir: string): Promise<ServerInfo | null> {
    setServerLoading(true)
    setServerError(false)
    try {
      const info = await resolveWorkspaceServer(dir)
      if (info) {
        // Health check to confirm server is actually running
        try {
          const res = await fetch(`${info.url}/api/v1/system/health`)
          if (res.ok) {
            setServerLoading(false)
            setServerError(false)
            retryCount = 0
            return info
          }
        } catch { /* health check failed */ }
      }
      setServerLoading(false)
      setServerError(true)
      return null
    } catch {
      setServerLoading(false)
      setServerError(true)
      return null
    }
  }

  function startRetry(dir: string) {
    stopRetry()
    const interval = Math.min(BASE_RETRY_INTERVAL + retryCount * 1000, MAX_RETRY_INTERVAL)
    retryTimer = setInterval(async () => {
      retryCount++
      const info = await resolveServer(dir)
      if (info) {
        setServer(info)
        stopRetry()
      }
    }, interval)
  }

  function stopRetry() {
    if (retryTimer) {
      clearInterval(retryTimer)
      retryTimer = undefined
    }
  }

  // React to active workspace changes
  createEffect(
    on(
      () => store.active,
      async (dir) => {
        stopRetry()
        setServer(null)

        if (!dir) return

        const info = await resolveServer(dir)
        if (info) {
          setServer(info)
        } else {
          // Start polling for server availability
          startRetry(dir)
        }
      },
    ),
  )

  onCleanup(() => stopRetry())

  // ── Detect server disconnect (SSE error) and reconnect ──────────────────

  // Re-resolve on visibility change (tab refocus / app comes back)
  if (typeof document !== "undefined") {
    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && store.active && !server()) {
        const info = await resolveServer(store.active)
        if (info) {
          setServer(info)
          stopRetry()
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    onCleanup(() => document.removeEventListener("visibilitychange", handleVisibility))
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const hasWorkspace = () => store.active !== null
  const isConnected = () => server() !== null

  return (
    <div class="flex h-screen w-screen bg-background-base text-text-base select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      <Toast.Region />
      {/* Rail — only show workspace avatars when there are workspaces */}
      <SidebarRail
        workspaces={store.workspaces}
        activeWorkspace={store.active ?? ""}
        onSwitchWorkspace={switchWorkspace}
        onOpenFolder={openFolderPicker}
      />

      {/* Main content area */}
      <Show
        when={hasWorkspace()}
        fallback={
          <WelcomeScreen
            onOpenFolder={openFolderPicker}
            onSelectWorkspace={addWorkspace}
          />
        }
      >
        <Show
          when={isConnected()}
          fallback={
            <div class="flex-1 flex items-center justify-center bg-background-stronger">
              <Show
                when={serverError()}
                fallback={
                  <div class="text-14-regular text-text-weak">Connecting...</div>
                }
              >
                <div class="text-center flex flex-col items-center gap-4">
                  <div class="flex flex-col items-center gap-2">
                    <div class="text-16-medium text-text-strong">No Server Found</div>
                    <div class="text-14-regular text-text-weak">
                      Run <code class="px-1.5 py-0.5 rounded bg-surface-raised-base text-13-regular font-mono">openacp start</code> in your workspace
                    </div>
                    <div class="text-12-regular text-text-weak font-mono mt-1">{store.active}</div>
                  </div>

                  {/* Reconnecting indicator */}
                  <div class="flex items-center gap-2 text-12-regular text-text-weaker">
                    <div class="w-1.5 h-1.5 rounded-full bg-text-weaker animate-pulse" />
                    Waiting for server...
                  </div>
                </div>
              </Show>
            </div>
          }
        >
          <WorkspaceProvider directory={store.active!} server={server()!}>
            <SessionsProvider>
              <ChatProvider>
                <SidebarPanel />
                <ChatArea />
              </ChatProvider>
            </SessionsProvider>
          </WorkspaceProvider>
        </Show>
      </Show>
    </div>
  )
}
