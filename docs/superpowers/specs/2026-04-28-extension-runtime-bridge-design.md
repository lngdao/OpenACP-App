# Sub-project #1 — Extension Runtime & Host Bridge

**Status:** approved 2026-04-28
**Branch:** `feat/extensions-runtime-bridge`
**Parent vision:** `2026-04-28-extension-system-vision.md`
**Audience:** maintainers implementing the extension runtime foundation

---

## 1. Goal & non-goals

**Goal.** Build the runtime foundation that lets extensions load, run, talk to the host, and shut down cleanly — without ever crashing the host or another extension. This is the contract layer; everything in sub-projects #2–#6 rides on top of it.

**In scope (this sub-project).**

- The two-tier iframe sandbox model (logic iframe + UI iframes) and how iframes are spawned, mounted, and disposed.
- The `openacp-ext://` Tauri custom URI scheme for serving extension bundles with per-extension origin and CSP.
- The host ↔ extension RPC envelope, dispatcher, and error model.
- The extension lifecycle state machine, crash detection, auto-restart, and quarantine policy.
- The capability registry pattern and how the 10 v1 capabilities (`commands`, `commandPalette`, `panels`, `statusBar`, `settings`, `notifications`, `events`, `storage`, `workspace.fs`, `http.fetch`) plug into it.
- The host-mediated SQLite storage backend (one DB per extension).
- The public `@openacp/extension-api` package shape (types + thin runtime stub).
- The Rust core surface (`tauri::commands`) that the host bridge calls into for storage, FS, and HTTP.
- Test infrastructure for the runtime and a small set of sample extensions used in tests.

**Out of scope (handed off to other sub-projects).**

- Full `extension.json` manifest schema validation, activation event vocabulary catalog, permission grant UI → sub-project #2.
- Concrete capability surfaces beyond enough to prove the pipeline works (e.g., the actual settings page rendering, the actual command palette UX) → sub-project #3.
- CLI scaffold, hot-reload from local folder, sample extension publishing → sub-project #4.
- Marketplace / signed tarball install flow / install UI → sub-project #5.
- Decorators on existing host panels, custom editors, language services, full webview panels → sub-project #6.

## 2. Decisions locked from the vision

These decisions come from the vision doc and are not relitigated here.

- Two-tier iframe sandbox (logic + UI iframes), no Web Workers.
- One iframe per extension, no shared sandbox.
- Async-only API surface (`Promise` for every host-bound call).
- Structured RPC for both directions, same wire format.
- v1 capability set fixed at 10 capabilities listed above.
- Deny-by-default permission model. Gated capabilities require explicit user grant on install.
- `@openacp/extension-api` is the only import surface. No globals.
- Naming: "Extension" (never "Plugin") in code, copy, and routing.

## 3. Decisions locked in this sub-project

- Iframe load mechanism: **Tauri custom URI scheme `openacp-ext://<extId>/<path>`**, registered Rust-side. Each extension gets a unique stable origin (`openacp-ext://<extId>`). The iframe `sandbox` attribute is `"allow-scripts allow-same-origin"` — `allow-same-origin` is required so the iframe inherits the scheme's origin instead of being demoted to an opaque `null` origin; `openacp-ext://ext-a` and `openacp-ext://ext-b` remain different origins because the host portion differs. CSP set per-response by the scheme handler.
- Bundle format: **directory bundle** with `extension.json` + `dist/main.js` + optional `dist/ui/<panelId>.html`. Distribution wire format is a gzipped tarball with a sidecar `signature.minisign`, file extension `.openacp-ext`. Install = verify signature → extract to `$APPDATA/extensions/<extId>/`.
- Activation: lazy by default. Activation events declared in the manifest: `onCommand:<id>`, `onPanel:<id>`, `onStatusBar:<id>`, `onWorkspaceOpen`, `onEvent:<host-event>`, `onStartup` (eager, install-time prompt warns the user).
- RPC error codes (locked set): `TIMEOUT`, `EXT_CRASHED`, `EXT_NOT_FOUND`, `PERMISSION_DENIED`, `INVALID_ARGS`, `HANDLER_THREW`, `SERIALIZATION_ERROR`. Wire shape: `{ code, message, data? }`.
- RPC default timeout: 30 s, overrideable per call via `{ timeout }` option.
- Storage policy (option C from brainstorming): one SQLite DB per extension; **no hard size cap per key**; runtime warning when a single value exceeds 256 KiB; soft total quota of 100 MiB per extension that triggers a user-visible toast when exceeded; no encryption at rest in v1.
- Crash quarantine: ≥ 3 crashes in a 5-minute sliding window puts the extension in `quarantined` state; user action required to re-enable.
- Heartbeat: host pings every 30 s; extension that does not pong within 10 s is treated as crashed.

## 4. Architecture topology

```
┌────────────────── Tauri main webview (host React tree) ──────────────────┐
│                                                                          │
│  Host runtime (TypeScript, src/openacp/extensions/*)                     │
│  ├─ ExtensionManager        catalog + install/enable/disable/uninstall   │
│  ├─ ExtensionLoader         iframe spawn / dispose                       │
│  ├─ HostBridge              RPC dispatcher + permission gate + heartbeat │
│  ├─ CapabilityRegistry      host-side implementations of capabilities    │
│  └─ ExtensionLogStore       per-extension ring buffer + crash flush      │
│                                                                          │
│  Hidden DOM container:                                                   │
│    <iframe id="ext-logic-{extId}" src="openacp-ext://{extId}/main"       │
│      sandbox="allow-scripts allow-same-origin" hidden />                 │
│                                                                          │
│  Per-panel UI containers (mounted into host slots on demand):            │
│    <iframe id="ext-ui-{extId}-{panelId}"                                 │
│      src="openacp-ext://{extId}/ui/{panelId}.html"                       │
│      sandbox="allow-scripts allow-same-origin" />                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                       │
                       │  postMessage (host ↔ each iframe)
                       ▼
┌────────── Tauri Rust core (src-tauri/src/core/extensions) ──────────────┐
│  uri_scheme handler `openacp-ext`                                        │
│    resolve {extId} → bundle on disk                                      │
│    enforce CSP per response                                              │
│    deny path traversal and symlink escapes                               │
│                                                                          │
│  tauri::command surface (host-only, never exposed to ext iframes)        │
│    ext_install, ext_uninstall, ext_enable, ext_disable, ext_list         │
│    ext_storage_get / set / delete / keys / clear / size                  │
│    ext_fs_read / write / list (allowlist-gated)                          │
│    ext_http_fetch (allowlist-gated)                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

The logic iframe of extension A cannot see the iframe of extension B. UI iframes only talk to the logic iframe of their own extension, and only through host-mediated relay; iframes never `postMessage` directly to each other.

## 5. File layout

New paths created by this sub-project.

```
src/openacp/extensions/                     # host-side runtime
  manager.ts                                # ExtensionManager
  loader.ts                                 # iframe spawn / dispose
  host-bridge.ts                            # RPC dispatcher + permission gate
  capabilities/
    commands.ts
    command-palette.ts
    panels.ts
    statusbar.ts
    settings.ts
    notifications.ts
    events.ts
    storage.ts
    workspace-fs.ts
    http-fetch.ts
  log-store.ts                              # per-ext ring buffer
  state-machine.ts                          # lifecycle FSM
  rpc/
    envelope.ts                             # wire format types + zod schemas
    timeout.ts
  types.ts                                  # shared types (manifest, capability ids)
  __tests__/

src/openacp/extensions-runtime/             # injected into ext iframes
  bootstrap.ts                              # set up postMessage, build api proxy
  rpc-client.ts                             # ext-side RPC client
  api/
    index.ts                                # api object factory
    commands.ts
    panels.ts
    storage.ts
    ...                                     # one file per capability (proxy only)
  index.ts                                  # built to dist/extension-runtime.js

src-tauri/src/core/extensions/
  mod.rs
  scheme.rs                                 # openacp-ext:// scheme handler
  commands.rs                               # tauri::command surface
  storage.rs                                # SQLite-per-ext
  install.rs                                # tarball verify + extract
  fs_gate.rs                                # workspace.fs allowlist
  http_gate.rs                              # http.fetch allowlist
  paths.rs                                  # $APPDATA/extensions/* helpers
  manifest.rs                               # minimal manifest reader (full schema in #2)

packages/extension-api/                     # public npm package
  src/
    index.ts                                # re-exports types and runtime stub
    types.ts                                # public types (Capability ids, EventName, etc.)
    runtime.ts                              # thin postMessage stub bound at ext load time
  package.json
  tsconfig.json
  README.md

src/openacp/api/extensions.ts               # thin TS client over tauri::commands
src/openacp/types.ts                        # extend with ExtensionId, ExtensionState, etc.
```

The `packages/extension-api/` directory lives inside the repo so the host build and the runtime build can share the same source of truth for types. The package is published to npm separately (handled by sub-project #4); the source lives here from day one so the contract evolves in lockstep.

## 6. IPC protocol

### 6.1 Wire format

All messages are JSON-serializable POJOs. Both directions use the same envelope shape.

```ts
type Envelope =
  | { v: 1; type: "invoke"; id: string; target: "host" | "ext"; method: string; args: unknown }
  | { v: 1; type: "response"; id: string; ok: true; result: unknown }
  | { v: 1; type: "response"; id: string; ok: false; error: { code: ErrorCode; message: string; data?: unknown } }
  | { v: 1; type: "ping"; id: string }
  | { v: 1; type: "pong"; id: string }
  | { v: 1; type: "lifecycle"; event: "activate" | "deactivate" }
  | { v: 1; type: "log"; level: "debug" | "info" | "warn" | "error"; args: unknown[] }

type ErrorCode =
  | "TIMEOUT"
  | "EXT_CRASHED"
  | "EXT_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "INVALID_ARGS"
  | "HANDLER_THREW"
  | "SERIALIZATION_ERROR"
```

`v: 1` is the wire version. Breaking changes increment it. The runtime accepts only `v: 1` in v1 and rejects unknown versions with `INVALID_ARGS`.

`id` is a UUIDv4. `method` is a dotted path like `commands.register`, `storage.workspace.get`, `events.subscribe`. `target` is `"host"` for ext → host calls and `"ext"` for host → ext calls (e.g., command invocation).

### 6.2 Validation

Every incoming `invoke` envelope passes through a Zod schema before being dispatched. Failures throw `INVALID_ARGS` with the validation issue list in `error.data`. Schemas live next to each capability in `src/openacp/extensions/capabilities/<cap>.ts`.

### 6.3 Serialization rules

Args and results must be structured-clone-safe **as the JSON subset**:

- Allowed: `null`, `boolean`, `number`, `string`, `Array`, plain `Object`, `Date`, `ArrayBuffer`, `Uint8Array`.
- Disallowed: `Function`, DOM nodes, class instances with prototypes, cyclic references, `Symbol`, `BigInt`.

The runtime serializes via `JSON.stringify` with a custom replacer that handles `Date`, `ArrayBuffer`, and `Uint8Array` via tagged objects. Anything else triggers `SERIALIZATION_ERROR`.

### 6.4 Default timeout

30 s default for any `invoke`. Override per call: `await api.x.y(args, { timeout: 60_000 })`. The ext-side RPC client tracks pending invocations; when the timeout fires it rejects with `TIMEOUT` and discards any late-arriving response.

Long-running operations (e.g., file watch streams) are **out of scope for v1**. Subscriptions and streams will use a separate mechanism added in a later sub-project.

### 6.5 Reverse RPC (host → ext handler invocation)

When an extension calls `await api.commands.register('foo.bar', handler)`:

1. The ext-side runtime stores `handler` in a local `Map<HandlerId, Function>` keyed by an internal `handlerId` (UUIDv4 generated ext-side).
2. The runtime sends an `invoke` envelope to the host: `{ method: "commands.register", args: { commandId: "foo.bar", handlerId } }`.
3. Host stores `{extId, commandId} → handlerId` in its registry.

When the host needs to invoke the command (user clicks a contributed entry), it sends an `invoke` envelope back: `{ target: "ext", method: "__invokeHandler", args: { handlerId, callArgs } }`. The ext-side runtime looks up the handler, runs it, replies with a normal response envelope. Errors thrown by the handler are caught and wrapped as `HANDLER_THREW`.

When an extension is unloaded, the host sends `{ type: "lifecycle", event: "deactivate" }`, then disposes the iframe. Handler refs are dropped when the iframe is torn down.

## 7. Lifecycle state machine

```
              install                enable                activate
  (none) ───────────────► installed ─────────► loading ──────────────► active
                              ▲                  │                       │
                              │ disable          │ activation failed     │ deactivate
                              │                  ▼                       │
                              │            ┌──────────┐                  │
                              │            │ failed   │                  │
                              │            └──────────┘                  │
                              │                                          │
                              │                     ┌────────────────────┘
                              │                     │
                              │                     ▼  crash | heartbeat-miss
                              │                ┌─────────┐
                              │                │ crashed │
                              │                └────┬────┘
                              │                     │ ≥3 in 5min
                              │                     ▼
                              │             ┌─────────────┐
                              │             │ quarantined │
                              │             └─────────────┘
                              │                     │ user action: reload
                              │                     ▼
                              │                  loading
                              │
                          uninstall
                              │
                              ▼
                           (none)
```

Transitions:

- `installed → loading`: host spawns the logic iframe and waits for the bootstrap handshake.
- `loading → active`: extension calls `await api.activated()`. Host marks the state and emits any pending activation events that fired during loading.
- `loading → failed`: bootstrap throws or handshake times out (10 s). The extension is left disabled until the user reloads it. Logs flushed.
- `active → crashed`: iframe `error` event fires, or heartbeat (30 s ping, 10 s pong window) misses.
- `crashed → loading`: auto-restart kicks in (re-spawn iframe). Counter increments.
- `crashed → quarantined`: 3 crashes within a 5-minute sliding window. Counter resets after 5 minutes of no crashes.
- `quarantined → loading`: user clicks "Reload" in the extension list, or `ExtensionManager.unquarantine(extId)` is called.

## 8. Storage layer

### 8.1 On-disk layout

One SQLite file per extension, per scope.

- Global storage: `$APPDATA/extensions/<extId>/storage.db`.
- Workspace storage: same file, with `workspace_uuid` as a column (avoids a per-workspace file explosion).

Schema:

```sql
CREATE TABLE kv (
  scope          TEXT NOT NULL,             -- 'global' | 'workspace'
  workspace_uuid TEXT,                      -- NULL when scope='global'
  key            TEXT NOT NULL,
  value          BLOB NOT NULL,             -- JSON-encoded with the same replacer used for RPC
  updated_at     INTEGER NOT NULL,
  byte_size      INTEGER NOT NULL,          -- length of value (used for quota tracking)
  PRIMARY KEY (scope, workspace_uuid, key)
);
CREATE INDEX kv_scope_ws ON kv(scope, workspace_uuid);
```

`byte_size` is denormalized so the host can compute total storage per extension cheaply for the soft-quota toast.

### 8.2 API

```ts
api.storage.global.get<T>(key: string): Promise<T | undefined>
api.storage.global.set(key: string, value: Json): Promise<void>
api.storage.global.delete(key: string): Promise<void>
api.storage.global.keys(): Promise<string[]>
api.storage.global.clear(): Promise<void>

api.storage.workspace.*  // identical shape, scoped to current workspace UUID
```

Workspace UUID is read from the host's existing workspace context; extensions never name a workspace explicitly.

### 8.3 Quota policy (option C)

- **Per-key**: no hard cap. If a single `set` value exceeds **256 KiB**, the runtime logs a warning with the key and the byte size to `ExtensionLogStore` (visible to the developer in the extension log viewer). The write proceeds.
- **Per-extension total**: soft cap **100 MiB** computed as `SUM(byte_size)`. When a `set` would push total beyond this, the host shows a one-time-per-extension toast: "Extension `<name>` is using more than 100 MiB of storage. View details." The write proceeds.
- **Hard rejection**: only when the SQLite write itself fails (disk full, corrupt DB, OS error) — surface as `INVALID_ARGS` with the underlying error in `data`.

Rationale: VSCode imposes no documented hard cap and directs large data to file APIs. We follow the same philosophy but instrument warnings so developers notice bloat before users complain.

### 8.4 No encryption at rest

Plaintext SQLite. Documented explicitly in extension developer docs: storage is plaintext; do not store secrets here. Secret storage gets a separate `api.secrets.*` API in a later sub-project, backed by the OS keychain via Tauri.

### 8.5 Cleanup

On uninstall, the host deletes `$APPDATA/extensions/<extId>/` recursively. No cross-extension cleanup needed because each extension has its own folder.

## 9. Permission and capability dispatch

Every `invoke` from an extension flows through `HostBridge.dispatch(extId, method, args)`:

1. **Resolve handler.** `CapabilityRegistry.lookup(method)`. Missing → `EXT_NOT_FOUND` (the method, not the extension).
2. **Capability declared.** Extract the capability from the method prefix (e.g., `storage.workspace.get` → `storage`). Check the extension's manifest declares it. Missing → `PERMISSION_DENIED`.
3. **Gated capability grant check.** For `workspace.fs` and `http.fetch`, check the user's grant flag (stored by sub-project #2). Not granted or revoked → `PERMISSION_DENIED`.
4. **Allowlist check** (gated capabilities only). For `workspace.fs`, the requested path must match an entry in the manifest's path allowlist. For `http.fetch`, the URL hostname must match the manifest's hostname allowlist. Mismatch → `PERMISSION_DENIED`.
5. **Validate args.** Run the capability's Zod schema. Fail → `INVALID_ARGS` with the issue list in `data`.
6. **Run the handler.** Capability handler executes. Throws → wrap as `HANDLER_THREW` with sanitized stack (strip absolute paths beyond `$APPDATA`).
7. **Serialize result.** Run through the JSON-subset replacer. Non-clonable → `SERIALIZATION_ERROR`.
8. **Reply.** Send response envelope.

Every step that produces an error logs to `ExtensionLogStore` with `{extId, method, invocationId, code}`.

## 10. Sub-project #2 hand-off shape (manifest)

Sub-project #1 needs **enough** of the manifest schema to spawn iframes and dispatch RPC. The full schema (validation, all activation events, marketplace fields, etc.) is owned by #2. Fields read in #1:

```ts
type MinimalManifest = {
  manifestVersion: 1
  id: string                    // reverse-DNS, e.g., "com.acme.bookmarks"
  version: string               // semver
  main?: string                 // path to dist/main.js, default "dist/main.js"
  uiEntries?: Record<string, string>  // panelId → relative html path
  capabilities: CapabilityId[]  // declared capabilities
  permissions?: {
    workspaceFs?: { allow: string[] }   // path allowlist
    httpFetch?: { allow: string[] }     // hostname allowlist
  }
  activationEvents: string[]    // raw strings, parsing is #2's job
}
```

Anything beyond these fields is ignored by #1's reader and validated by #2 when it ships.

## 11. Public API package shape

`packages/extension-api/src/index.ts` exports:

```ts
export type ExtensionApi = {
  activated(): Promise<void>
  commands: { register, executeCommand }
  commandPalette: { register }
  panels: { register }
  statusBar: { register }
  settings: { register, get, watch }
  notifications: { show }
  events: { subscribe }
  storage: { global: KvNamespace; workspace: KvNamespace }
  workspaceFs: { read, write, list }       // throws PERMISSION_DENIED if not granted
  httpFetch: (url, init?) => Promise<Response>  // throws PERMISSION_DENIED if not granted
  log: { debug, info, warn, error }
}
```

The actual types per method are defined alongside each capability file in `packages/extension-api/src/types.ts`. The runtime stub at `packages/extension-api/src/runtime.ts` is what an extension actually imports; it discovers the runtime that the host injected and returns a proxy that translates calls into RPC envelopes.

The package exposes a single entrypoint helper:

```ts
import { defineExtension } from "@openacp/extension-api"

export default defineExtension(async (api) => {
  await api.commands.register("hello.world", () => api.notifications.show({ message: "hi" }))
  await api.activated()
})
```

`defineExtension` is imported by the bundler and emitted as the default export of `dist/main.js`. The bootstrap script in the iframe imports the bundle, calls the default export with the proxy `api`, and signals readiness when the function resolves.

## 12. Testing strategy

| Layer | Tooling | What it covers |
|---|---|---|
| Unit (TS) | Vitest | `HostBridge.dispatch` happy path, every error code path, RPC envelope serializer round-trip, state-machine transitions, log store ring buffer eviction, quota warning thresholds. |
| Integration (TS, jsdom) | Vitest + jsdom | Spawn a fake iframe, exchange RPC, verify timeout, verify heartbeat-miss → crashed transition, verify crash counter → quarantine. |
| Tauri/Rust unit | `cargo test` | Scheme handler resolves bundle paths, denies path traversal, denies symlink escape, sets CSP per response, `storage.rs` SQLite round-trip including quota size accounting, `fs_gate.rs` and `http_gate.rs` allowlist matchers. |
| End-to-end | Manual + `pnpm tauri dev` with `--features dev-extensions` | Load `_ignore/sample-extensions/hello-world` from disk, exercise lifecycle (load → activate → invoke command → deactivate), force-crash via `crashy` sample, verify quarantine after 3 crashes, verify storage roundtrip via `storage-stress` sample. |

**Sample extensions** for testing (kept under `_ignore/sample-extensions/`, not shipped):

- `hello-world` — registers a command, contributes a sidebar panel, shows a notification.
- `crashy` — throws on activation; throws inside a command handler; `process.exit`-style escape attempt to verify isolation.
- `slow` — handler sleeps longer than the timeout.
- `chatty` — emits 10k log lines per second; verifies log store eviction.
- `storage-stress` — writes 200 KiB values, verifies warning fires at 256 KiB, fills near the 100 MiB soft cap, verifies toast.
- `fs-probe` — declares `workspace.fs` with allowlist `["src/**"]`, attempts read inside and outside the allowlist.
- `http-probe` — declares `http.fetch` with allowlist `["api.example.com"]`, attempts allowed and denied requests.

**Coverage gate.** ≥ 80% line coverage on `src/openacp/extensions/**` and `src-tauri/src/core/extensions/**`. CI fails below threshold.

## 13. Open implementation questions deferred to the plan

These are decisions that affect implementation order but not architecture, so they belong in the implementation plan (sub-project #1's plan), not this design.

- Order of extraction: build the Rust scheme handler first (so iframes can be loaded against a real origin) or build the host-side bridge first (with a fake `srcdoc` placeholder)?
- How sample extensions are bundled in tests — keep raw JS, or bundle through esbuild as part of the test setup?
- Whether `defineExtension` lives in `@openacp/extension-api` or in a separate `@openacp/extension-api/runtime` subpath.
- How the install.rs tarball verification handles minisign in v1 (full signature flow, or stub-and-warn until sub-project #5 wires it up).
