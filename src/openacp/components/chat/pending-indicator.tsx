import { useChat } from "../../context/chat"

export function PendingIndicator() {
  const chat = useChat()
  const items = chat.pending()

  if (items.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground">
      <div className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
      <span>
        {items.length === 1
          ? items[0].sender?.displayName
            ? `Message from ${items[0].sender.displayName} waiting...`
            : "1 message waiting..."
          : `${items.length} messages waiting...`}
      </span>
    </div>
  )
}
