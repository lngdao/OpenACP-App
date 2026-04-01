/**
 * Workspace persistence using Tauri Store plugin.
 * Stores: list of workspace directories + last active workspace.
 * Falls back to localStorage when Tauri is unavailable (dev/browser).
 */

interface WorkspaceData {
  workspaces: string[]
  lastActive: string | null
}

const STORE_KEY = "data"
const LS_KEY = "openacp-workspaces"

let storeInstance: any = null

async function getStore() {
  if (storeInstance) return storeInstance
  try {
    const { Store } = await import("@tauri-apps/plugin-store")
    storeInstance = await Store.load("workspaces.json", { autoSave: true } as any)
    return storeInstance
  } catch {
    return null
  }
}

function readLS(): WorkspaceData {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : { workspaces: [], lastActive: null }
  } catch {
    return { workspaces: [], lastActive: null }
  }
}

function writeLS(data: WorkspaceData) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

export async function loadWorkspaceData(): Promise<WorkspaceData> {
  const store = await getStore()
  if (store) {
    try {
      const data = await store.get(STORE_KEY) as WorkspaceData | undefined
      if (data) return data
    } catch { /* fall through */ }
  }
  return readLS()
}

export async function saveWorkspaceData(data: WorkspaceData): Promise<void> {
  const store = await getStore()
  if (store) {
    try {
      await store.set(STORE_KEY, data)
      await store.save()
      return
    } catch { /* fall through */ }
  }
  writeLS(data)
}

/**
 * Discover known workspaces from ~/.openacp/instances.json
 * This file is maintained by the OpenACP server.
 */
export async function discoverWorkspaces(): Promise<string[]> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    const dirs = await invoke<string[]>("discover_workspaces")
    return dirs
  } catch (e) {
    return []
  }
}
