# OpenACP App — Extension System Vision

**Status:** approved 2026-04-28
**Audience:** maintainers planning the extension platform
**Scope:** direction-setting meta-spec; not a single-feature design

---

## 1. Goal & non-goals

**Goal.** Enable third-party developers to extend the OpenACP desktop app with their own panels, commands, themes, decorators, and integrations through a stable, sandboxed extension API. End users install extensions like browser or VSCode extensions and customize their workflow without forking the app.

**Non-goals (v1).**

- Extensions running native binaries (sidecar runtime).
- Extensions in languages other than JavaScript/TypeScript (WASM included).
- Restructuring the host shell layout (extensions augment, they do not replace top-level chrome).
- A custom marketplace backend before there is something worth publishing.

## 2. Foundation philosophy

**The single most important rule of this document.**

> Foundation is the set of decisions that, once published, are expensive or impossible to change without breaking every extension already on disk. Foundation must be production-grade in v1. Foundation does **not** mean every feature ships in v1.

If we conflate "foundation done well" with "every feature in v1," we ship nothing for a year and never collect feedback from real extensions.

**In foundation (production-grade, v1, no shortcuts):**

- Process and runtime model.
- IPC contract between host and extension.
- Permission model and grant flow.
- Manifest schema (`extension.json`) and forward-compatibility rules.
- API versioning policy for `@openacp/extension-api`.
- Crash and error isolation guarantees.

**Outside foundation (ship later without changing the contract):**

- Additional runtimes (WASM, sidecar) — added through the runtime registry.
- Additional contribution points — added under the same activation and permission rules.
- Marketplace backend — local-folder install and signed-tarball install precede any registry.
- Authoring tools (CLI scaffold, hot-reload, samples).

## 3. Sub-projects

Six independent sub-projects, each with its own design spec and implementation plan, built in dependency order.

| # | Sub-project | Depends on | Scope |
|---|---|---|---|
| 1 | Extension Runtime & Host Bridge | — | Sandbox model (iframe two-tier), postMessage RPC, lifecycle, crash isolation, runtime registry. |
| 2 | Manifest, Activation & Permissions | 1 | `extension.json` schema, activation events, permission declaration and grant UI. |
| 3 | Contribution Points API v1 | 1, 2 | Sidebar panel, command palette command, status bar item, settings page, theme registration. |
| 4 | Dev Tooling | 1–3 | `create-openacp-extension`, hot-reload from local folder, `@openacp/extension-api` types package, sample extensions. |
| 5 | Distribution & Install | 1–3 | Local-folder install, signed-tarball install, registry/marketplace flow. |
| 6 | Advanced Contribution Points | 3 | Decorators on existing panels (chat, file tree, browser), webview panels, custom editors, language services. |

After this vision is approved, the next brainstorming target is sub-project #1.

## 4. Cross-cutting decisions — locked

These decisions apply across all sub-projects. They are decided here so individual sub-project specs do not relitigate them.

- **Extension language.** JavaScript/TypeScript only in v1. Manifest schema and runtime registry must permit adding WASM and native sidecar runtimes later **without bumping the manifest major version**.
- **Sandbox direction.** Extensions run out-of-host in sandboxed iframes with locked-down CSP and no host DOM access by default. Implementation detail belongs to sub-project #1, but the direction is locked: extensions never live in the host React tree.
- **API surface.** `@openacp/extension-api` is the single import surface. No global `window.openacp`. Extensions receive their API instance via the runtime, never via globals.
- **Permission default.** Deny-by-default. Every gated capability is explicit in the manifest and requires user grant on install.
- **Versioning.** Semver on `@openacp/extension-api`. Breaking changes require a major bump and a migration window where both versions are loadable. Manifest schema gets its own integer `manifestVersion` independent of the API version.
- **Naming.** The system is called **Extensions**, never **Plugins**. "Plugin" is reserved for the existing OpenACP core/server plugin system surfaced through `client.listPlugins()`. The two systems are unrelated and must not be confused in code, UI copy, or docs.

## 5. Sub-project #1 decisions — locked

These decisions are settled here so the sub-project #1 design spec begins from a settled architecture and only details the implementation.

### 5.1 Runtime topology — two-tier iframe

VSCode-style two-tier model, all iframes (no Web Workers):

- **Logic iframe.** One per extension. Hidden, sandboxed, runs the extension's `main` entrypoint.
- **UI iframe.** Spawned on demand for each panel or webview the extension contributes. Each UI surface is its own iframe.
- UI iframes communicate with the logic iframe through host-mediated postMessage. Iframes never talk to each other directly.

**Why iframes over Web Workers.** Sandboxed iframes give true origin isolation; Web Workers share origin with the host. Iframes have full Web API; Workers expose a subset that extensions will run into. Per-iframe DevTools makes debugging tractable.

### 5.2 Isolation — one iframe per extension

No shared sandbox. Each extension is fully isolated from siblings.

- A crash in one extension does not affect others or the host.
- Permission and storage scopes are per-extension.
- Memory cost: ~5–10 MB per iframe baseline; ~150 MB ceiling for 20 active extensions, acceptable for a desktop app.

### 5.3 API shape — async-only

Every host-bound API call returns a `Promise`. No sync proxy.

- Sync proxies (Comlink-style with SharedArrayBuffer + Atomics) require COOP+COEP headers, hide real semantics, and complicate the runtime.
- Industry precedent (VSCode, Figma, Raycast, Obsidian) is async-only.
- Honest async semantics give extension authors clear error and timeout boundaries.

### 5.4 Host → extension calls — structured RPC

Reverse calls (host invoking an extension-contributed handler) use the same RPC envelope as extension → host calls.

- On `api.commands.register('foo.bar', handler)`, the runtime assigns a stable `handlerId` and stores `{extId → handlerId → handlerRef}`.
- When the host needs to invoke: `{type: "invoke", handlerId, invocationId, args}` → the extension runtime looks up the handler, runs it, replies with `{type: "response", invocationId, result | error}`.
- Same wire format in both directions. Handler refs are garbage-collected on extension unload.
- No generic event bus for this. Event-bus reverse calls lack clear timeout and error semantics and produce spaghetti.

### 5.5 Capability set — v1

Capabilities are declared in `extension.json`. Permission-gated capabilities also require user grant on install.

**v1 (in):**

| Capability | Description | Gate |
|---|---|---|
| `commands` | Register and invoke commands. | always-on |
| `commandPalette` | Contribute entries to the command palette. | always-on |
| `panels` | Contribute a panel into a host slot (sidebar / bottom / modal). | always-on |
| `statusBar` | Status bar item: text, icon, tooltip, onClick. | always-on |
| `settings` | Contribute a settings page section, schema-driven (JSON Schema → host renders with host components). | always-on |
| `notifications` | Show toast notifications via the host's `showToast`. Extensions do not build their own notification UI. | always-on |
| `events` | Subscribe to host events: workspace open/close, session start/end, agent message, theme change, and similar lifecycle signals. | always-on |
| `storage` | Per-extension KV store (workspace-scoped and global-scoped). Backend and at-rest encryption decided in sub-project #1. | always-on |
| `workspace.fs` | Read and write files in the current workspace, scoped to a path allowlist declared in the manifest. | **permission-gated** |
| `http.fetch` | HTTP requests with a hostname allowlist declared in the manifest. | **permission-gated** |

**Out of v1 (deferred to later sub-projects):**

- Chat message decorators, file tree decorators, custom file icons — sub-project #6.
- Custom editors, language services — sub-project #6.
- Full webview panels (extension-controlled iframe in the workspace area) — default placement is sub-project #6. Sub-project #1's spec may pull it forward if doing so does not change the runtime contract; that call belongs there.
- New activity bar items or view containers — sub-project #6.
- Auth providers, telemetry contribution, native sidecar runtime — outside the foundation scope.
- i18n contribution surface (how an extension registers translation bundles) — sub-project #3.
- Theme contribution: the host already has a theme registry (see `src/openacp/lib/themes`). Sub-project #3 exposes an API for extensions to register theme entries into that registry. No new theme infrastructure is needed.

## 6. Cross-cutting decisions — deferred

Each is decided in the named sub-project, not here.

- **Marketplace shape** (own registry vs GitHub-backed vs npm-backed) → sub-project #5.
- **Theme integration** with the existing `data-theme` + `data-mode` system → sub-project #3.
- **i18n for extension UIs** → sub-project #3.
- **Hot-reload mechanism** (file watcher vs explicit reload) → sub-project #4.

## 7. Constraints from the existing codebase

- App is **Tauri** (Rust backend + React in a webview). The extension runtime must respect Tauri's IPC and CSP model. Tauri-specific APIs (window, fs, shell) are never exposed directly to extensions; they are mediated through `@openacp/extension-api`.
- The design rules in `CLAUDE.md` (token-only colors, font-weight ≤ 500, 4px spacing grid, no emoji in UI, shadcn primitives, dark-mode first-class) apply to host-rendered UI. Extension UIs inside their own iframe are not bound to host tokens. Extensions contributing into host slots (e.g., a settings page section) must use host components or accept second-class visual integration.
- Existing host panels — Sidebar, ChatView, FileTree, Browser, Terminal, Review — are the natural injection targets for sub-project #6 contribution points.
- Existing "Plugins" UI (`src/openacp/components/plugins-modal.tsx`, `plugins-installed.tsx`, `plugins-marketplace.tsx`) is for OpenACP core/server plugins surfaced through `client.listPlugins()`. The Extensions UI is a separate surface and uses the term **Extensions** consistently in code, copy, and routing.

## 8. Open questions for sub-project #1 brainstorming

These are implementation-level questions left open for the sub-project #1 design spec to resolve, given the architecture locked in section 5.

- **Iframe origin and CSP.** `srcdoc` vs `blob:` URL vs an extension-host origin. Affects fetch behavior and storage isolation.
- **Activation events.** Eager vs lazy load; which events trigger which extensions; cold-start budget.
- **Extension bundle format.** Single JS file vs directory with `manifest.json` + `dist/`; signing scope; how Tauri resolves the bundle on disk.
- **Permission grant UI.** When a user installs an extension that declares gated capabilities, what does the prompt look like? Per-capability vs all-at-once.
- **Lifecycle and crash recovery.** What does "extension crashed" look like to the user? Auto-restart policy, surfacing error logs, kill switch.
- **Error and timeout semantics on RPC.** Default timeout per call, propagation of structured errors (host code → ext, ext → host), serialization rules for non-JSON values.
- **Storage backend.** SQLite via Tauri vs IndexedDB inside the iframe vs both. Encryption at rest.
