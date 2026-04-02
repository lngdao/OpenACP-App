/**
 * Workspace persistence using Tauri Store plugin.
 * Primary key is instance ID (from ~/.openacp/instances.json), not workspace path.
 * Falls back to localStorage when Tauri is unavailable (dev/browser).
 */

export interface InstanceInfo {
  id: string
  root: string      // path to .openacp dir
  workspace: string // parent of root (workspace root dir)
}

interface WorkspaceData {
  instances: string[]     // instance IDs
  lastActive: string | null // instance ID
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
    if (!raw) return { instances: [], lastActive: null }
    const parsed = JSON.parse(raw)
    // Migrate old format: { workspaces: string[] } → { instances: string[] }
    if (Array.isArray(parsed.workspaces) && !parsed.instances) {
      return { instances: [], lastActive: null }
    }
    return parsed
  } catch {
    return { instances: [], lastActive: null }
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
      if (data) {
        // Migrate old format: { workspaces: string[] } → { instances: string[] }
        if ((data as any).workspaces && !data.instances) {
          return { instances: [], lastActive: null }
        }
        return data
      }
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
 * Discover all registered instances from ~/.openacp/instances.json via Tauri.
 */
export async function discoverWorkspaces(): Promise<InstanceInfo[]> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    return await invoke<InstanceInfo[]>("discover_workspaces")
  } catch {
    return []
  }
}
