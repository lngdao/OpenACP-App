import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"

export interface GitRepoInfo {
  name: string
  path: string
  branch: string
}

export type GitMode = "single" | "multi" | "none"

const POLL_INTERVAL = 5000

export function useGitRepos(directory: string) {
  const [mode, setMode] = useState<GitMode>("none")
  const [repos, setRepos] = useState<GitRepoInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    invoke<GitRepoInfo[]>("discover_git_repos", { directory })
      .then((result) => {
        if (result.length === 0) {
          setMode("none")
          setRepos([])
        } else if (result.length === 1 && result[0].path === directory) {
          setMode("single")
          setRepos(result)
        } else {
          setMode("multi")
          setRepos(result)
        }
      })
      .catch(() => {
        setMode("none")
        setRepos([])
      })
      .finally(() => setLoading(false))
  }, [directory])

  // Initial load + polling
  useEffect(() => {
    setLoading(true)
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [refresh])

  return { mode, repos, loading, refresh }
}
