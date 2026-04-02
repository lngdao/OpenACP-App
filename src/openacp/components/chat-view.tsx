import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { useChat } from "../context/chat"
import { useSessions } from "../context/sessions"
import { MessageBubble } from "./message"

function ChatHeader() {
  const chat = useChat()
  const sessions = useSessions()

  const session = createMemo(() => {
    const id = chat.activeSession()
    if (!id) return undefined
    return sessions.list().find((s) => s.id === id)
  })

  const title = createMemo(() => session()?.name || "Untitled")

  return (
    <Show when={chat.activeSession()}>
      <div class="flex items-center h-11 px-4 border-b border-border-weaker-base flex-shrink-0">
        <div class="flex-1 min-w-0">
          <span class="text-14-medium text-text-strong truncate block">{title()}</span>
        </div>
        <div class="flex items-center gap-1.5">
          {/* Context circle — placeholder */}
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
            title="Context"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>
          {/* More options — placeholder */}
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-icon-weak hover:text-icon-base hover:bg-surface-raised-base-hover transition-colors"
            title="More options"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="4.5" cy="10" r="1.25" fill="currentColor" />
              <circle cx="10" cy="10" r="1.25" fill="currentColor" />
              <circle cx="15.5" cy="10" r="1.25" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </Show>
  )
}

function EmptyState() {
  const chat = useChat()
  const sessions = useSessions()

  const hasSession = () => !!chat.activeSession()

  const [creating, setCreating] = createSignal(false)

  async function handleNewSession() {
    if (creating()) return
    setCreating(true)
    try {
      const session = await sessions.create()
      if (session) {
        chat.setActiveSession(session.id)
      } else {
        const { showToast } = await import("../../ui/src/components/toast")
        showToast({ description: "Failed to create session. Max sessions may be reached.", variant: "error" })
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div class="h-full flex flex-col items-center justify-center">
      <div class="flex flex-col items-center gap-5">
        {/* Icon */}
        <div class="w-10 h-10 rounded-lg bg-surface-raised-base flex items-center justify-center border border-border-weaker-base">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.292 6.04167L16.2503 9.99998L12.292 13.9583M2.91699 9.99998H15.6253M17.0837 3.75V16.25" stroke="currentColor" stroke-linecap="square" class="text-text-weak" />
          </svg>
        </div>

        <div class="text-center">
          <div class="text-14-medium text-text-strong">
            <Show when={hasSession()} fallback="No session selected">
              Ready to chat
            </Show>
          </div>
          <div class="text-13-regular text-text-weak mt-1">
            <Show when={hasSession()} fallback="Create a new session or select one from the sidebar">
              Type a message below to start
            </Show>
          </div>
        </div>

        <Show when={!hasSession()}>
          <button
            class="flex items-center gap-2 px-4 py-2 rounded-lg border border-border-base text-13-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors active:scale-[0.98] disabled:opacity-50"
            onClick={handleNewSession}
            disabled={creating()}
          >
            <Show when={creating()} fallback={
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M10 4.16699V15.8337M4.16699 10.0003H15.8337" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            }>
              <div class="w-3.5 h-3.5 border-2 rounded-full oac-spinner" style={{ "border-color": "var(--text-weak)", "border-top-color": "transparent" }} />
            </Show>
            <Show when={creating()} fallback="New Session">
              Creating...
            </Show>
          </button>
        </Show>
      </div>
    </div>
  )
}

export function ChatView() {
  const chat = useChat()
  let scrollRef: HTMLDivElement | undefined

  createEffect(() => {
    const msgs = chat.messages()
    chat.streaming()
    if (msgs.length && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight
      })
    }
  })

  const hasMessages = () => chat.activeSession() && chat.messages().length > 0

  return (
    <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
      <ChatHeader />
      <div class="flex-1 min-h-0 overflow-hidden">
        <Show
          when={hasMessages()}
          fallback={<EmptyState />}
        >
          <div
            ref={scrollRef}
            class="h-full overflow-y-auto no-scrollbar pt-3"
          >
            <div class="px-4 md:max-w-200 md:mx-auto 2xl:max-w-[1000px] pb-6 flex flex-col gap-5">
              <For each={chat.messages()}>
                {(msg, index) => {
                  const isLast = () => index() === chat.messages().length - 1
                  return (
                    <MessageBubble
                      message={msg}
                      streaming={chat.streaming() && isLast() && msg.role === "assistant"}
                    />
                  )
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
