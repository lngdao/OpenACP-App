import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import fs from "node:fs"

const host = process.env.TAURI_DEV_HOST

// Custom resolver that maps @opencode-ai/* workspace imports to local copies
function opencodeResolver() {
  const uiComponents = path.resolve(__dirname, "src/ui/src/components")
  const uiSrc = path.resolve(__dirname, "src/ui/src")
  const appSrc = path.resolve(__dirname, "src/app-src")
  const utilSrc = path.resolve(__dirname, "src/util/src")
  const sdkSrc = path.resolve(__dirname, "src/openacp-sdk")

  return {
    name: "opencode-resolver",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      // @opencode-ai/ui/* → src/ui/src/components/*.tsx or src/ui/src/*
      if (source.startsWith("@opencode-ai/ui/")) {
        const rest = source.slice("@opencode-ai/ui/".length)

        // Special paths
        if (rest === "styles") return path.join(uiSrc, "styles/index.css")
        if (rest.startsWith("styles/")) return path.join(uiSrc, rest + "/index.css")
        if (rest === "theme") return path.join(uiSrc, "theme/index.ts")
        if (rest.startsWith("theme/")) {
          const tsx = path.join(uiSrc, rest + ".tsx")
          if (fs.existsSync(tsx)) return tsx
          return path.join(uiSrc, rest + ".ts")
        }
        if (rest === "hooks") return path.join(uiSrc, "hooks/index.ts")
        if (rest === "context") return path.join(uiSrc, "context/index.ts")
        if (rest.startsWith("context/")) return path.join(uiSrc, rest + ".tsx")
        if (rest.startsWith("i18n/")) return path.join(uiSrc, rest + ".ts")
        if (rest === "pierre") return path.join(uiSrc, "pierre/index.ts")
        if (rest.startsWith("pierre/")) return path.join(uiSrc, rest + ".ts")
        if (rest === "icons/provider") return path.join(uiSrc, "components/provider-icons/types.ts")

        // Default: component import → src/ui/src/components/<name>.tsx
        const tsxPath = path.join(uiComponents, rest + ".tsx")
        if (fs.existsSync(tsxPath)) return tsxPath
        const tsPath = path.join(uiComponents, rest + ".ts")
        if (fs.existsSync(tsPath)) return tsPath

        return null
      }

      // @opencode-ai/app → src/app-src/index.ts
      if (source === "@opencode-ai/app") return path.join(appSrc, "index.ts")
      if (source === "@opencode-ai/app/index.css") return path.join(appSrc, "index.css")

      // @opencode-ai/util/* → src/util/src/*.ts
      if (source.startsWith("@opencode-ai/util/")) {
        const rest = source.slice("@opencode-ai/util/".length)
        return path.join(utilSrc, rest + ".ts")
      }

      // @opencode-ai/sdk/* → src/sdk/src/*
      if (source.startsWith("@opencode-ai/sdk/")) {
        const rest = source.slice("@opencode-ai/sdk/".length)
        const tsPath = path.join(sdkSrc, rest + ".ts")
        if (fs.existsSync(tsPath)) return tsPath
        const tsxPath = path.join(sdkSrc, rest + ".tsx")
        if (fs.existsSync(tsxPath)) return tsxPath
        const indexPath = path.join(sdkSrc, rest, "index.ts")
        if (fs.existsSync(indexPath)) return indexPath
        return null
      }

      // Stub out @pierre/diffs (OpenCode internal package we don't have)
      if (source.startsWith("@pierre/")) {
        return "\0virtual:pierre-stub"
      }

      // Stub out ghostty-web
      if (source === "ghostty-web") {
        return "\0virtual:ghostty-stub"
      }

      return null
    },
    load(id: string) {
      if (id === "\0virtual:pierre-stub" || id === "\0virtual:ghostty-stub") {
        return "export default {}; export const Virtualizer = class {}; export const WorkerPoolManager = class {}; export const getSharedHighlighter = () => ({}); export const registerCustomTheme = () => {}; export const DEFAULT_VIRTUAL_FILE_METRICS = {}; export const File = () => null; export const FileDiff = () => null; export const VirtualizedFile = () => null; export const VirtualizedFileDiff = () => null; export const Terminal = class {}; export const Ghostty = class {};"
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [opencodeResolver(), solid(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/app-src"),
    },
  },
  build: {
    rollupOptions: {
      external: [
        /^@pierre\/.*/,
        "ghostty-web",
      ],
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
})
