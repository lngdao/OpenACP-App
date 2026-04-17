import React from "react"
import { WorkerPoolContextProvider } from "@pierre/diffs/react"
import { registerCustomTheme, type ThemeRegistrationResolved } from "@pierre/diffs"

const THEME_NAME = "OpenACP"
let themeRegistered = false

function ensureTheme() {
  if (themeRegistered) return
  themeRegistered = true
  registerCustomTheme(THEME_NAME, () =>
    Promise.resolve({
      name: THEME_NAME,
      colors: {
        "editor.background": "var(--bg-base)",
        "editor.foreground": "var(--fg-weak)",
      },
      tokenColors: [
        { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: "var(--syntax-comment)" } },
        { scope: ["entity.other.attribute-name"], settings: { foreground: "var(--syntax-property)" } },
        { scope: ["constant", "entity.name.constant", "variable.other.constant", "variable.language", "entity"], settings: { foreground: "var(--syntax-constant)" } },
        { scope: ["entity.name", "meta.export.default", "meta.definition.variable"], settings: { foreground: "var(--syntax-type)" } },
        { scope: ["meta.object.member"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["variable.parameter.function", "meta.jsx.children", "meta.block", "meta.tag.attributes", "entity.name.constant", "meta.embedded.expression", "meta.template.expression", "string.other.begin.yaml", "string.other.end.yaml"], settings: { foreground: "var(--syntax-punctuation)" } },
        { scope: ["entity.name.function", "support.type.primitive"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["support.class.component"], settings: { foreground: "var(--syntax-type)" } },
        { scope: "keyword", settings: { foreground: "var(--syntax-keyword)" } },
        { scope: ["keyword.operator", "storage.type.function.arrow", "punctuation.separator.key-value.css", "entity.name.tag.yaml", "punctuation.separator.key-value.mapping.yaml"], settings: { foreground: "var(--syntax-operator)" } },
        { scope: ["storage", "storage.type"], settings: { foreground: "var(--syntax-keyword)" } },
        { scope: ["storage.modifier.package", "storage.modifier.import", "storage.type.java"], settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["string", "punctuation.definition.string", "string punctuation.section.embedded source", "entity.name.tag"], settings: { foreground: "var(--syntax-string)" } },
        { scope: "support", settings: { foreground: "var(--syntax-primitive)" } },
        { scope: ["support.type.object.module", "variable.other.object", "support.type.property-name.css"], settings: { foreground: "var(--syntax-object)" } },
        { scope: "meta.property-name", settings: { foreground: "var(--syntax-property)" } },
        { scope: "variable", settings: { foreground: "var(--syntax-variable)" } },
        { scope: "variable.other", settings: { foreground: "var(--syntax-variable)" } },
      ],
      semanticTokenColors: {},
    } as unknown as ThemeRegistrationResolved),
  )
}

export { THEME_NAME }

export function PierreWorkerPoolProvider({ children }: { children: React.ReactNode }) {
  ensureTheme()

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => {
          const url = new URL("@pierre/diffs/worker/worker.js", import.meta.url)
          return new Worker(url, { type: "module" })
        },
        poolSize: 2,
      }}
      highlighterOptions={{
        theme: THEME_NAME,
        preferredHighlighter: "shiki-wasm",
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  )
}
