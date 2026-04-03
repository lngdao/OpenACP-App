/**
 * File attachment validation and encoding utilities.
 * Ported from legacy app with simplifications for React.
 */

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
export const MAX_ATTACHMENTS = 10

const IMAGE_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
])

const TEXT_MIMES = new Set([
  "text/plain", "text/markdown", "text/csv", "text/html", "text/css",
  "text/xml", "text/yaml", "text/x-yaml",
  "application/json", "application/ld+json", "application/xml",
  "application/yaml", "application/toml", "application/x-toml",
  "application/x-yaml",
])

const CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift",
  "c", "cpp", "cc", "h", "hpp",
  "cs", "php", "lua", "r", "m",
  "sh", "zsh", "bash", "fish",
  "css", "scss", "sass", "less",
  "html", "htm", "vue", "svelte",
  "sql", "graphql", "gql",
  "yaml", "yml", "toml", "ini", "conf",
  "json", "jsonc", "json5",
  "xml", "svg",
  "md", "mdx", "txt", "log", "csv",
  "env", "gitignore", "dockerignore",
  "dockerfile", "makefile",
])

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ""
}

function isTextBytes(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    // Allow tab, newline, carriage return, and printable ASCII + UTF-8 continuation bytes
    if (b === 0) return false
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return false
  }
  return true
}

/**
 * Validate a file and return its normalized MIME type, or null if unsupported.
 */
export async function validateFileMime(file: File): Promise<string | null> {
  const mime = file.type.split(";")[0]?.trim().toLowerCase() ?? ""

  // Known image MIME
  if (IMAGE_MIMES.has(mime)) return mime

  // PDF
  if (mime === "application/pdf") return mime

  // Known text MIME
  if (TEXT_MIMES.has(mime) || mime.startsWith("text/")) return "text/plain"

  // Fallback: check extension
  const ext = getExtension(file.name)
  if (IMAGE_MIMES.has(`image/${ext}`)) return `image/${ext}`
  if (ext === "pdf") return "application/pdf"
  if (CODE_EXTENSIONS.has(ext)) return "text/plain"

  // Last resort: sample bytes to detect text vs binary
  if (file.size > 0) {
    const sample = Math.min(4096, file.size)
    const bytes = new Uint8Array(await file.slice(0, sample).arrayBuffer())
    if (isTextBytes(bytes)) return "text/plain"
  }

  return null // unsupported
}

/**
 * Read a File as a base64 data URL.
 */
export function fileToDataUrl(file: File, mime: string): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      const idx = result.indexOf(",")
      if (idx === -1) { resolve(result); return }
      resolve(`data:${mime};base64,${result.slice(idx + 1)}`)
    }
    reader.onerror = () => resolve("")
    reader.readAsDataURL(file)
  })
}

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime)
}

/**
 * Accept string for file input elements.
 */
export const ACCEPTED_FILE_TYPES = [
  ...IMAGE_MIMES,
  "application/pdf",
  "text/*",
  "application/json",
  "application/xml",
  "application/yaml",
  "application/toml",
  ...Array.from(CODE_EXTENSIONS).map(e => `.${e}`),
].join(",")
