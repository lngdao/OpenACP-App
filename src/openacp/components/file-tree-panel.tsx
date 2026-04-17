import React, { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ResizeHandle } from "./ui/resize-handle"
import { TreeNode, type FileNode } from "./file-tree/tree-node"
import { GitDiff, Files, CaretRight, CaretDown, FolderSimple } from "@phosphor-icons/react"
import { useGitRepos, type GitRepoInfo } from "../hooks/use-git-repos"

const DEFAULT_WIDTH = 280
const MIN_WIDTH = 200
const MAX_WIDTH = 480

interface FileChange {
  path: string
  status: "modified" | "added" | "deleted" | "untracked"
}

interface RepoChanges {
  repo: GitRepoInfo
  changes: FileChange[]
}

interface FileTreePanelProps {
  workspacePath: string
  onOpenFile: (path: string, content: string, language: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  modified: "text-yellow-400",
  added: "text-green-400",
  deleted: "text-red-400",
  untracked: "text-muted-foreground",
}

const STATUS_LABELS: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  untracked: "?",
}

function GroupedChangesView({
  repoChanges,
  onOpenChange,
}: {
  repoChanges: RepoChanges[]
  onOpenChange: (repoPath: string, filePath: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggleCollapse(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="flex flex-col">
      {repoChanges.map(({ repo, changes }) => {
        const isCollapsed = collapsed.has(repo.path)
        const hasChanges = changes.length > 0

        return (
          <div key={repo.path}>
            <button
              type="button"
              className={`flex items-center gap-1.5 w-full px-3 py-1.5 text-left transition-colors ${
                hasChanges ? "hover:bg-accent" : ""
              }`}
              onClick={() => hasChanges && toggleCollapse(repo.path)}
              disabled={!hasChanges}
            >
              {hasChanges ? (
                isCollapsed ? (
                  <CaretRight size={10} className="shrink-0 text-fg-weakest" />
                ) : (
                  <CaretDown size={10} className="shrink-0 text-fg-weakest" />
                )
              ) : (
                <span className="w-2.5" />
              )}
              <FolderSimple size={12} weight="fill" className={`shrink-0 ${hasChanges ? "text-fg-weaker" : "text-fg-weakest"}`} />
              <span className={`text-xs truncate ${hasChanges ? "text-fg-weaker" : "text-fg-weakest"}`}>
                {repo.name}
              </span>
              <span className={`text-2xs ${hasChanges ? "text-fg-weak" : "text-fg-weakest"}`}>
                {repo.branch}
              </span>
              <span className="flex-1" />
              {hasChanges && (
                <span className="text-2xs text-fg-weakest">{changes.length}</span>
              )}
            </button>

            {hasChanges && !isCollapsed && (
              <div className="flex flex-col">
                {changes.map((change) => (
                  <button
                    key={`${repo.path}/${change.path}`}
                    type="button"
                    className="flex items-center gap-2 w-full text-left pl-7 pr-3 py-[3px] hover:bg-accent rounded-sm transition-colors text-sm"
                    onClick={() => onOpenChange(repo.path, change.path)}
                    title={change.path}
                  >
                    <span className={`text-2xs font-mono shrink-0 w-3 ${STATUS_COLORS[change.status]}`}>
                      {STATUS_LABELS[change.status]}
                    </span>
                    <span className="truncate text-fg-weak">{change.path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function FileTreePanel({ workspacePath, onOpenFile }: FileTreePanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [mode, setMode] = useState<"files" | "changes">("files")
  const [rootNodes, setRootNodes] = useState<FileNode[]>([])
  const [changes, setChanges] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(true)
  const [repoChanges, setRepoChanges] = useState<RepoChanges[]>([])
  const { mode: gitMode, repos: gitRepos } = useGitRepos(workspacePath)
  // Stable key: only re-fetch when repo paths/branches actually change
  const reposKey = gitRepos.map((r) => `${r.path}:${r.branch}`).join("|")

  const [refreshKey, setRefreshKey] = useState(0)

  // Refresh when workspace, mode, or refreshKey changes
  useEffect(() => {
    if (!workspacePath) return
    setLoading(true)
    if (mode === "files") {
      invoke<FileNode[]>("read_directory", { path: workspacePath })
        .then(setRootNodes)
        .catch(() => setRootNodes([]))
        .finally(() => setLoading(false))
    } else if (gitMode === "multi" && gitRepos.length > 1) {
      Promise.all(
        gitRepos.map((repo) =>
          invoke<FileChange[]>("get_workspace_changes", { path: repo.path })
            .then((changes) => ({ repo, changes }))
            .catch(() => ({ repo, changes: [] as FileChange[] }))
        )
      )
        .then(setRepoChanges)
        .finally(() => setLoading(false))
    } else {
      invoke<FileChange[]>("get_workspace_changes", { path: workspacePath })
        .then((c) => {
          setChanges(c)
          setRepoChanges([])
        })
        .catch(() => {
          setChanges([])
          setRepoChanges([])
        })
        .finally(() => setLoading(false))
    }
  }, [workspacePath, mode, refreshKey, gitMode, reposKey])

  // Auto-refresh when agent modifies files (tool_call completed for file-related tools)
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>
    function handleAgentEvent(e: Event) {
      const { event } = (e as CustomEvent).detail ?? {}
      if (!event) return

      // Refresh when a file-related tool starts (SSE only sends pending, not completed)
      if (event.type === "tool_call") {
        const fileTools = ["write", "edit", "bash", "terminal", "notebookedit"]
        if (fileTools.includes(event.name?.toLowerCase())) {
          clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => setRefreshKey(k => k + 1), 1000)
        }
        return
      }

      // Also refresh when agent response finishes (catches all changes)
      if (event.type === "usage") {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => setRefreshKey(k => k + 1), 300)
      }
    }
    window.addEventListener("agent-event", handleAgentEvent)
    return () => {
      window.removeEventListener("agent-event", handleAgentEvent)
      clearTimeout(debounceTimer)
    }
  }, [])

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      const result = await invoke<{ content: string; language: string }>("read_file_content", { path })
      onOpenFile(path, result.content, result.language)
    } catch (e) {
      console.error("[file-tree] failed to read file:", e)
    }
  }, [onOpenFile])

  const handleOpenChange = useCallback(async (filePath: string) => {
    const absPath = filePath.startsWith("/") ? filePath : `${workspacePath}/${filePath}`
    await handleOpenFile(absPath)
  }, [workspacePath, handleOpenFile])

  return (
    <div
      className="relative flex flex-col min-h-0 bg-background border-l border-border-weak shrink-0 h-full"
      style={{ width: `${width}px` }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="start"
        size={width}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setWidth}
      />

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 h-9 border-b border-border-weak">
        <span className="text-sm font-medium text-foreground">Files</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={`p-1 rounded transition-colors ${mode === "files" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="All files"
            onClick={() => setMode("files")}
          >
            <Files size={14} />
          </button>
          <button
            type="button"
            className={`p-1 rounded transition-colors ${mode === "changes" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Changes"
            onClick={() => setMode("changes")}
          >
            <GitDiff size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 py-1">
        {loading ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">Loading...</div>
        ) : mode === "files" ? (
          rootNodes.length > 0 ? (
            rootNodes.map((node) => (
              <TreeNode key={node.path} node={node} depth={0} onOpenFile={handleOpenFile} />
            ))
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">No files found</div>
          )
        ) : repoChanges.length > 0 ? (
          <GroupedChangesView
            repoChanges={repoChanges}
            onOpenChange={(repoPath, filePath) => {
              const absPath = filePath.startsWith("/") ? filePath : `${repoPath}/${filePath}`
              handleOpenFile(absPath)
            }}
          />
        ) : changes.length > 0 ? (
          <div className="flex flex-col">
            {changes.map((change) => (
              <button
                key={change.path}
                type="button"
                className="flex items-center gap-2 w-full text-left px-3 py-[3px] hover:bg-accent rounded-sm transition-colors text-sm"
                onClick={() => handleOpenChange(change.path)}
                title={change.path}
              >
                <span className={`text-2xs font-mono shrink-0 w-3 ${STATUS_COLORS[change.status]}`}>
                  {STATUS_LABELS[change.status]}
                </span>
                <span className="truncate text-fg-weak">{change.path}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-4 text-sm text-muted-foreground">No changes</div>
        )}
      </div>
    </div>
  )
}
