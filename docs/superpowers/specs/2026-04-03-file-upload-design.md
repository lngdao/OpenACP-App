# File Upload Feature — Design Spec

## Overview

Add file attachment support to OpenACP App + Server. Users can attach images, text/code files, and PDFs to messages sent to AI agents. Images are forwarded as base64 vision content; text files are read and injected into the prompt.

## Server Changes (`/Projects/OpenACP`)

### Extend Prompt API Schema

**File:** `src/plugins/api-server/schemas/sessions.ts`

```typescript
const AttachmentSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  data: z.string(), // base64-encoded file content
})

export const PromptBodySchema = z.object({
  prompt: z.string().min(1).max(100_000),
  attachments: z.array(AttachmentSchema).max(10).optional(),
})
```

### Decode & Forward Attachments

**File:** `src/plugins/api-server/routes/sessions.ts`

In the POST `/sessions/:sessionId/prompt` handler:
1. Parse `attachments` from request body
2. For each attachment: write base64 data to temp file under OS temp dir
3. Build `Attachment[]` array: `{ type, filePath, fileName, mimeType, size }`
4. Call `session.enqueuePrompt(body.prompt, attachments)`
5. Temp files are cleaned up after agent processes them (or on session end)

Type mapping:
- `image/*` → `type: 'image'`
- `audio/*` → `type: 'audio'`
- Everything else → `type: 'file'`

### Same change for SSE adapter

**File:** `src/plugins/sse-adapter/routes.ts` — same schema extension for the SSE prompt route.

## App Changes (`/Projects/OpenACP-App`)

### Types

**File:** `src/openacp/types.ts`

```typescript
export interface FileAttachment {
  id: string
  fileName: string
  mimeType: string
  dataUrl: string  // data:{mime};base64,{content}
  size: number
}
```

### API Client

**File:** `src/openacp/api/client.ts`

Extend `sendPrompt` to accept optional attachments:

```typescript
async sendPrompt(sessionID: string, text: string, attachments?: FileAttachment[]): Promise<void> {
  const body: any = { prompt: text }
  if (attachments?.length) {
    body.attachments = attachments.map(a => ({
      fileName: a.fileName,
      mimeType: a.mimeType,
      data: a.dataUrl.split(',')[1], // strip data URL prefix, send raw base64
    }))
  }
  await api(`/sessions/${encodeURIComponent(sessionID)}/prompt`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}
```

### Composer UI

**File:** `src/openacp/components/composer.tsx`

#### Input methods
1. **Attach button** (existing `+` placeholder) → opens native file dialog via hidden `<input type="file">`
2. **Drag & drop** → drop zone over composer area, visual feedback overlay
3. **Clipboard paste** → `Cmd+V` / `Ctrl+V` intercept, extract image from clipboard

#### Attachment state
- `attachments` state: `FileAttachment[]`
- Max 10 files, max 10MB each
- Validated by MIME type detection (same logic as legacy: check MIME, fallback to extension, sample bytes for text detection)

#### Preview strip
- Shown above the text input when attachments exist
- Images: thumbnail (48x48 rounded), filename overlay
- Non-images: file icon + filename
- Each has an X button to remove
- Clicking image opens full preview

### File Validation

**File:** `src/openacp/lib/file-utils.ts` (new)

Ported from legacy `_ignore/legacy/app/components/prompt-input/files.ts`:

- `validateFileMime(file: File): string | null` — returns normalized MIME or null if unsupported
- `fileToDataUrl(file: File, mime: string): Promise<string>` — FileReader base64 encoding
- `isTextMime(mime: string): boolean`
- `ACCEPTED_MIMES` — set of supported MIME types
- `ACCEPTED_EXTENSIONS` — map of extension → MIME for fallback

Supported file types:
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- PDF: `application/pdf`
- Text: `text/*`, `.txt`, `.md`, `.log`, `.csv`
- Data: `.json`, `.xml`, `.yaml`, `.toml`
- Code: `.js`, `.ts`, `.tsx`, `.py`, `.rs`, `.go`, `.java`, `.cpp`, `.c`, `.rb`, `.sh`, `.css`, `.scss`, `.html`, `.sql`, `.graphql`

### Chat Context

**File:** `src/openacp/context/chat.tsx`

- `doSendPrompt(text, attachments?)` — pass attachments to API client
- User message blocks include attachment metadata for display

### User Message Display

**File:** `src/openacp/components/chat/user-message.tsx`

- Show attachment thumbnails/icons below message text
- Click image → preview modal

## Data Flow

```
User: drag file / paste / click attach
  ↓
Validate MIME type + size (< 10MB)
  ↓
FileReader.readAsDataURL() → base64 data URL
  ↓
Add to attachments[] state → show preview strip
  ↓
User clicks send
  ↓
client.sendPrompt(text, attachments)
  → POST /sessions/:id/prompt { prompt, attachments: [{ fileName, mimeType, data }] }
  ↓
Server: decode base64 → write temp file → build Attachment[]
  ↓
session.enqueuePrompt(text, attachments)
  ↓
AgentInstance.prompt(text, attachments)
  → image: base64 ContentBlock → agent vision API
  → text/code: read file → append to prompt text
  → other: "[Attached file: path]" fallback
```

## Error Handling

- File too large (>10MB): toast warning, reject file
- Unsupported format: toast warning, reject file  
- Upload failure: toast error, keep attachments in composer for retry
- Max 10 attachments: toast warning when limit reached
