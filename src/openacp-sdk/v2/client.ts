/**
 * @openacp/app-sdk — Stub types matching OpenCode SDK interface.
 * Will be replaced with real OpenACP API client.
 */

export type Session = {
  id: string
  projectID?: string
  title?: string
  parentID?: string
  created: number
  updated: number
  version: number
}

export const Session = {
  name: (s: Session) => s.title ?? "Untitled",
}

export type Message = {
  id: string
  role: "user" | "assistant"
  sessionID: string
  created: number
  metadata?: Record<string, unknown>
  parts?: Part[]
}

export type Part = {
  id: string
  type: string
  messageID: string
  content?: string
  metadata?: Record<string, unknown>
}

export const Part = {}

export type Project = {
  id?: string
  worktree: string
  time: { created: number; updated: number }
}

export type Event = {
  type: string
  directory?: string
  properties: Record<string, any>
}

export type FileContent = {
  path: string
  content: string
  language?: string
}

export type FileDiff = {
  path: string
  before?: string
  after?: string
}

export type TextPartInput = { type: "text"; content: string }
export type FilePartInput = { type: "file"; path: string }
export type AgentPartInput = { type: "agent"; content: string }

export type UserMessage = Message & { role: "user" }
export type AssistantMessage = Message & { role: "assistant" }
export const EventSessionError = "session.error"

export function createOpencodeClient(_opts: { url: string; headers?: Record<string, string>; fetch?: typeof globalThis.fetch }) {
  return {
    global: {
      event: async (_opts?: any) => ({ stream: (async function* () {})() }),
    },
    session: {
      list: async () => ({ data: [] as Session[] }),
      get: async (_id: string) => ({ data: null as Session | null }),
      create: async (_opts?: any) => ({ data: null as Session | null }),
      delete: async (_id: string) => ({}),
      prompt: async (_id: string, _msg: any) => ({}),
    },
    project: {
      list: async () => ({ data: [] as Project[] }),
    },
    message: {
      list: async (_sessionId: string) => ({ data: [] as Message[] }),
    },
  }
}
