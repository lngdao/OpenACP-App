import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useWorkspace } from "./workspace"
import { cacheSessions, loadCachedSessions } from "../api/session-cache"
import { clearCachedMessages } from "../api/history-cache"
import { showToast } from "../lib/toast"
import type { Session } from "../types"

interface SessionsContext {
  list: () => Session[]
  loading: () => boolean
  create: (agent?: string) => Promise<Session | null>
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  archive: (id: string) => Promise<void>
  refresh: () => Promise<void>
  upsert: (session: Session) => void
  delete: (id: string) => void
}

const Ctx = createContext<SessionsContext | undefined>(undefined)

export function useSessions() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider")
  return ctx
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const aTime = new Date(a.lastActiveAt ?? a.createdAt).getTime()
    const bTime = new Date(b.lastActiveAt ?? b.createdAt).getTime()
    return bTime - aTime
  })
}

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // Persist sessions to cache whenever they change (including empty list)
  useEffect(() => {
    void cacheSessions(workspace.directory, sessions)
  }, [sessions, workspace.directory])

  /** Fetch authoritative session list from server */
  const fetchFromServer = useCallback(async (): Promise<Session[] | null> => {
    try {
      const result = await workspace.client.listSessions()
      return sortSessions(result)
    } catch {
      return null
    }
  }, [workspace.client])

  const refresh = useCallback(async () => {
    try {
      // Load cache first for instant display
      const cached = await loadCachedSessions(workspace.directory)
      if (cached && cached.length > 0 && sessionsRef.current.length === 0) {
        setSessions(cached)
      }

      // Server is authoritative — always replace
      const serverList = await fetchFromServer()
      if (serverList !== null) {
        setSessions(serverList)
      }
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [workspace.directory, fetchFromServer])

  const create = useCallback(async (agent?: string): Promise<Session | null> => {
    try {
      const session = await workspace.client.createSession({ agent })
      setSessions((prev) => {
        if (prev.some((s) => s.id === session.id)) return prev
        return [session, ...prev]
      })
      return session
    } catch (e) {
      console.error("[sessions] create failed:", e)
      return null
    }
  }, [workspace.client])

  const remove = useCallback(async (id: string) => {
    // Optimistic: remove from UI immediately
    setSessions((prev) => prev.filter((s) => s.id !== id))

    // Call server
    try {
      await workspace.client.deleteSession(id)
    } catch (e) {
      console.error("[sessions] delete API failed:", e)
    }

    // Clean up message cache for this session
    void clearCachedMessages(id).catch(() => {})

    // Re-fetch from server to ensure consistency (server is truth)
    const serverList = await fetchFromServer()
    if (serverList !== null) {
      setSessions(serverList)
    }
  }, [workspace.client, fetchFromServer])

  const rename = useCallback(async (id: string, name: string) => {
    // Optimistic rename
    const previousName = sessionsRef.current.find((s) => s.id === id)?.name
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name } : s))

    try {
      await workspace.client.renameSession(id, name)
    } catch (e) {
      // Revert on failure
      if (previousName !== undefined) {
        setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name: previousName } : s))
      }
      showToast({ description: "Failed to rename session" })
      console.error("[sessions] rename failed:", e)
    }
  }, [workspace.client])

  const archive = useCallback(async (id: string) => {
    // Optimistic: remove from UI
    setSessions((prev) => prev.filter((s) => s.id !== id))

    try {
      await workspace.client.archiveSession(id)
    } catch (e) {
      console.error("[sessions] archive failed:", e)
    }

    // Clean up message cache
    void clearCachedMessages(id).catch(() => {})

    // Re-fetch to reconcile
    const serverList = await fetchFromServer()
    if (serverList !== null) {
      setSessions(serverList)
    }
  }, [workspace.client, fetchFromServer])

  const upsert = useCallback((session: Session) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === session.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = session
        return next
      }
      return [session, ...prev]
    })
  }, [])

  const del = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo((): SessionsContext => ({
    list: () => sessions,
    loading: () => loading,
    create,
    remove,
    rename,
    archive,
    refresh,
    upsert,
    delete: del,
  }), [sessions, loading, create, remove, rename, archive, refresh, upsert, del])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
