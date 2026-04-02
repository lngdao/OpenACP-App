import { createSignal, For, Show, createMemo, onMount, onCleanup } from "solid-js"
import { useChat } from "../context/chat"
import { useWorkspace } from "../context/workspace"

interface CommandItem {
  id: string
  label: string
  description?: string
  group: string
  shortcut?: string
  action: () => void | Promise<void>
}

export function CommandPalette(props: {
  sessionID: string | undefined
  onClose: () => void
  onSlashCommand: (cmd: string) => void
}) {
  const [query, setQuery] = createSignal("")
  const chat = useChat()
  const workspace = useWorkspace()
  let inputRef: HTMLInputElement | undefined

  onMount(() => inputRef?.focus())

  // Close on escape
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      props.onClose()
    }
  }

  const commands = createMemo((): CommandItem[] => {
    const items: CommandItem[] = []

    // Context group
    items.push({
      id: "attach-file",
      label: "Attach file...",
      group: "Context",
      action: () => { props.onClose() },
    })
    items.push({
      id: "mention-file",
      label: "Mention file from this project...",
      group: "Context",
      action: () => { props.onClose() },
    })
    items.push({
      id: "clear",
      label: "Clear conversation",
      group: "Context",
      action: () => { props.onClose() },
    })

    // Commands group
    items.push({
      id: "cmd-mode",
      label: "/mode",
      description: "Change session mode",
      group: "Commands",
      action: () => {
        props.onSlashCommand("/mode")
        props.onClose()
      },
    })
    items.push({
      id: "cmd-model",
      label: "/model",
      description: "Change AI model",
      group: "Commands",
      action: () => {
        props.onSlashCommand("/model")
        props.onClose()
      },
    })

    return items
  })

  const filtered = createMemo(() => {
    const q = query().toLowerCase().trim()
    if (!q) return commands()
    return commands().filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q)
    )
  })

  const groups = createMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of filtered()) {
      const list = map.get(item.group) ?? []
      list.push(item)
      map.set(item.group, list)
    }
    return Array.from(map.entries())
  })

  return (
    <div
      class="w-full rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha shadow-lg overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {/* Search */}
      <div class="px-3 py-2 border-b border-border-weaker-base">
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter actions..."
          class="w-full bg-transparent text-14-regular text-text-strong placeholder:text-text-weak focus:outline-none"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </div>

      {/* Items */}
      <div class="max-h-64 overflow-y-auto py-1">
        <Show when={filtered().length === 0}>
          <div class="px-3 py-3 text-13-regular text-text-weak text-center">No actions found</div>
        </Show>

        <For each={groups()}>
          {([group, items]) => (
            <div>
              <div class="px-3 py-1" style={{ "font-size": "11px", color: "var(--text-weaker)" }}>
                {group}
              </div>
              <For each={items}>
                {(item) => (
                  <button
                    class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-raised-base-hover transition-colors"
                    onClick={() => item.action()}
                  >
                    <span class="text-13-medium text-text-strong">{item.label}</span>
                    <Show when={item.description}>
                      <span class="text-text-weak flex-1 min-w-0 truncate" style={{ "font-size": "12px" }}>{item.description}</span>
                    </Show>
                    <Show when={item.shortcut}>
                      <span class="text-text-weaker font-mono" style={{ "font-size": "11px" }}>{item.shortcut}</span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
