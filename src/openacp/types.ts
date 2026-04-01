export interface Session {
  id: string
  name: string
  agent: string
  status: "initializing" | "active" | "finished" | "cancelled" | "error"
  workspace: string
  createdAt: string
  lastActiveAt?: string | null
}

export interface Message {
  id: string
  role: "user" | "assistant"
  sessionID: string
  parentID?: string
  content: string
  createdAt: number
}

export interface Part {
  id: string
  type: "text" | "tool-invocation" | "thought"
  messageID: string
  content: string
}

export interface Agent {
  name: string
  displayName?: string
  description?: string
}

export interface ServerInfo {
  url: string
  token: string
}

export interface TokenInfo {
  accessToken: string
  tokenId: string
  expiresAt: string
  refreshDeadline: string
}

export interface StoredToken {
  id: string
  name: string
  role: string
  scopes?: string[]
  createdAt: string
  refreshDeadline: string
  lastUsedAt?: string
  revoked: boolean
}

export interface AuthInfo {
  type: "secret" | "jwt"
  tokenId?: string
  role: string
  scopes: string[]
}

/** SSE agent:event payload from OpenACP server */
export interface AgentEvent {
  sessionId: string
  event: {
    type: "text" | "usage" | "error" | "tool_call" | "thought" | "commands_update"
    content?: string
    messageId?: string
    partId?: string
    [key: string]: unknown
  }
}
