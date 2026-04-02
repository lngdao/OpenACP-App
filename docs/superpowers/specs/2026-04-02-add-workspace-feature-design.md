# Spec: Add Workspace Feature

**Date:** 2026-04-02
**Status:** Draft
**Related specs:**
- [Core Spec: Instances CLI & Auth Codes](../../../OpenACP/docs/superpowers/specs/2026-04-02-instances-cli-and-auth-codes-design.md)
- [Core Spec: App Connectivity](../../../OpenACP/docs/superpowers/specs/2026-03-31-app-connectivity-design.md)
- [Core Spec: Auth System](../../../OpenACP/docs/superpowers/specs/2026-03-31-auth-system-design.md)

## Overview

Add a full-screen modal for adding new workspaces to the OpenACP desktop app. Supports two workspace types: **Local** (same machine, discovered via CLI) and **Remote** (via `openacp remote` link with code-exchange auth). Migrate workspace store to use instance `id` as the primary key and store complete workspace metadata.

---

## 1. Workspace Store Migration

### Current State

`workspace-store.ts` and `app.tsx` track instance IDs as a flat array, reading live info from the filesystem via Tauri commands. The Tauri `discover_workspaces()` command reads `~/.openacp/instances.json` directly.

### New WorkspaceEntry Schema

All workspaces (local and remote) are stored with full metadata. The `id` field is the immutable primary key.

```typescript
interface WorkspaceEntry {
  id: string            // instance id — primary key, immutable
  name: string          // display name (can be updated)
  directory: string     // absolute path: local project dir or remote server path (display only)
  type: 'local' | 'remote'

  // Remote only
  host?: string         // current tunnel/remote host URL — mutable, updated on reconnect
  tokenId?: string      // JWT token id for revocation
  role?: string         // token role
  expiresAt?: string    // JWT expiry (ISO 8601)
  refreshDeadline?: string
}
```

`host` is explicitly mutable: the same remote workspace can reconnect with a different tunnel URL. The `id` identifies the workspace, not the `host`.

### Storage

Persisted via Tauri Store plugin (localStorage fallback) as `WorkspaceEntry[]` under key `workspaces`. Indexed by `id` in memory.

### Tauri Backend: Replace `discover_workspaces()`

Remove `discover_workspaces()` from `lib.rs`. Replace with a generic `invoke_cli(args: string[]) → string` Tauri command that invokes the OpenACP sidecar and returns stdout.

```typescript
// Before
const instances = await invoke<InstanceInfo[]>('discover_workspaces')

// After
const stdout = await invoke<string>('invoke_cli', { args: ['instances', 'list', '--json'] })
const instances: InstanceListEntry[] = JSON.parse(stdout)
```

All CLI interactions go through `invoke_cli`. No direct file reads for instance data.

---

## 2. Add Workspace Modal

### Trigger

Button "+" on the sidebar rail → opens a full-screen modal overlay.

The existing onboarding flow is unchanged — it always runs on first launch and sets up the main workspace. The Add Workspace modal is only for adding additional workspaces after initial setup.

### Layout

Full-screen modal with two tabs: **Local** and **Remote**.

---

### Tab: Local

#### Section A — Known Instances

On open, call `openacp instances list --json` via `invoke_cli`. Display results:

```
Known Instances
───────────────────────────────────────
● Main          /Users/user           :21420
○ My Project    /Users/user/my-proj   —
```

- `●` = running, `○` = stopped
- Click any row → add that workspace (if not already added)
- If already in workspace store: show checkmark, row not clickable

#### Section B — Browse Folder

"Browse for a folder..." button → Tauri folder picker → resolve to absolute path.

**Duplicate check:** Compare resolved path against `directory` field of all entries returned by `instances list --json`. Path comparison is always against absolute paths — `~/` is expanded before comparison.

**Cases:**
1. **Path matches a known instance** — offer to add it (same as clicking from Section A).
2. **Path has `.openacp/` but not in instances list** — offer "Register this existing instance" → call `openacp instances create --dir <path> --no-interactive --json` to register it.
3. **Path has no `.openacp/`** — show creation options:
   - **Clone from existing** — dropdown listing current instances → call `openacp instances create --dir <path> --from <selectedDir> --name <name> --json`
   - **Create new** — mini setup: input name + agent picker → call `openacp instances create --dir <path> --name <name> --agent <agent> --no-interactive --json`

After `instances create --json` returns, parse the JSON to get the new instance `id` and add it to the workspace store.

---

### Tab: Remote

#### Input

Single input field: "Paste `openacp://` link or URL"

Accepts:
- `openacp://connect?host=<host>&code=<code>`
- `https://<host>?code=<code>`
- `http://localhost:<port>?code=<code>`

#### Connection Flow

```
1. Parse URL → extract host + code
2. POST {host}/api/v1/auth/exchange { code }
   → 401: "Invalid or expired code" → show error
   → Network error: "Cannot reach {host}" → show error
   → 200: receive { accessToken, tokenId, expiresAt, refreshDeadline }
3. GET {host}/api/v1/workspace (Authorization: Bearer <accessToken>)
   → receive { id, name, directory, version }
4. GET {host}/api/v1/auth/me
   → receive { role, scopes }
5. Show preview:
   ┌─────────────────────────────────────┐
   │ Connected to: Main                  │
   │ Host:    abc-123.trycloudflare.com  │
   │ Role:    admin                      │
   │ Expires: 2026-04-03 14:30 (24h)    │
   └─────────────────────────────────────┘
   [Add Workspace]  [Cancel]
6. User confirms → store JWT in OS keychain (keyed by workspace id)
7. Upsert WorkspaceEntry by id:
   → Existing id found: update host + token fields (reconnect case)
   → New id: add new entry
8. Close modal, switch to new workspace
```

**Keychain storage:** JWT stored via Tauri Stronghold or OS credential store, keyed by `workspace:<id>`. Raw token is never stored in the workspace store or Tauri Store — only `tokenId` is stored there for reference.

---

## 3. JWT Lifecycle for Remote Workspaces

### Token Refresh

The existing API client already attempts `POST /api/v1/auth/refresh` on 401. Wire the result back to the keychain — update the stored JWT when refresh succeeds.

### Reconnect Needed State

A remote workspace enters **Reconnect Needed** state when:
- 401 and `refreshDeadline` has passed (cannot refresh)
- Host is unreachable (network error on any request)
- 401/403 with non-refreshable error

**UX:**
- Badge on sidebar workspace icon: "Reconnect"
- Clicking the workspace → opens Add Workspace modal pre-focused on Remote tab
- User pastes new `openacp://` link → same connection flow as above
- `id` from new link matches existing workspace → updates `host` + JWT in place

In all cases, the user action is identical: paste a new link.

---

## 4. Workspace Info Refresh

On app startup and when switching to a workspace, refresh the stored `name` and `directory` from the live instance:
- **Local:** re-run `instances list --json`, update entry if name changed
- **Remote:** `GET {host}/api/v1/workspace` if connected, update entry if name changed

This keeps display info current without requiring the user to re-add workspaces.

---

## Files to Add / Modify

### New Files (app)
- `src/openacp/components/add-workspace/` — modal component directory
  - `index.tsx` — modal wrapper
  - `local-tab.tsx` — local instances list + folder browse
  - `remote-tab.tsx` — URL input + connection flow
  - `create-instance.tsx` — clone/create new instance sub-flow

### Modified Files (app)
- `src/openacp/api/workspace-store.ts` — migrate to `WorkspaceEntry` schema
- `src/openacp/app.tsx` — add "+" button to sidebar rail, wire modal, migrate instance state to `WorkspaceEntry[]`
- `src-tauri/src/lib.rs` — remove `discover_workspaces()`, add `invoke_cli()` command

### Modified Files (app, auth)
- `src/openacp/api/client.ts` — update JWT refresh to write back to keychain; handle reconnect-needed state
- `src/openacp/context/workspace.tsx` — update to use `WorkspaceEntry`, read token from keychain for remote workspaces
