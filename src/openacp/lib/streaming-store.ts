/**
 * Lightweight external store for streaming text.
 * Bypasses React/Immer state entirely during streaming — only the leaf
 * Markdown component subscribes, preventing parent re-renders.
 *
 * Usage: SSE handler appends text here instead of calling setStore().
 * When streaming ends, flush the accumulated text into Immer once.
 */

type Listener = () => void

class StreamingTextStore {
  private _text = ""
  private _listeners = new Set<Listener>()

  get text() { return this._text }

  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  getSnapshot = (): string => this._text

  append(chunk: string) {
    this._text += chunk
    for (const l of this._listeners) l()
  }

  reset() {
    this._text = ""
  }

  /** Flush: return accumulated text and reset */
  flush(): string {
    const text = this._text
    this._text = ""
    return text
  }
}

// One store per block key (sessionID-based)
const stores = new Map<string, StreamingTextStore>()

export function getStreamingStore(key: string): StreamingTextStore {
  let s = stores.get(key)
  if (!s) {
    s = new StreamingTextStore()
    stores.set(key, s)
  }
  return s
}

export function deleteStreamingStore(key: string) {
  stores.delete(key)
}
