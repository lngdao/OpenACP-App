import React, { useEffect, useState } from "react"
import { getSetting, setSetting, applyTheme, applyFontSize, type AppSettings } from "../../lib/settings-store"

export function SettingsAppearance() {
  const [theme, setTheme] = useState<AppSettings["theme"]>("dark")
  const [fontSize, setFontSize] = useState<AppSettings["fontSize"]>("medium")

  useEffect(() => {
    void getSetting("theme").then(setTheme)
    void getSetting("fontSize").then(setFontSize)
  }, [])

  async function handleThemeChange(value: AppSettings["theme"]) {
    setTheme(value)
    await setSetting("theme", value)
    applyTheme(value)
  }

  async function handleFontSizeChange(value: AppSettings["fontSize"]) {
    setFontSize(value)
    await setSetting("fontSize", value)
    applyFontSize(value)
  }

  return (
    <div data-component="oac-settings" className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg-medium text-foreground mb-1">Appearance</h2>
        <p className="text-sm-regular text-muted-foreground">Customize the look and feel</p>
      </div>

      <SettingRow label="Theme" description="Choose between light, dark, or system theme">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(["light", "dark", "system"] as const).map((opt) => (
            <button
              key={opt}
              className={`px-3 py-1 rounded text-sm-medium transition-colors ${
                theme === opt
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground-weak"
              }`}
              onClick={() => void handleThemeChange(opt)}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Font size" description="Adjust the interface font size">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(["small", "medium", "large"] as const).map((opt) => (
            <button
              key={opt}
              className={`px-3 py-1 rounded text-sm-medium transition-colors ${
                fontSize === opt
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground-weak"
              }`}
              onClick={() => void handleFontSizeChange(opt)}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </SettingRow>
    </div>
  )
}

function SettingRow(props: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border-weak/50 last:border-b-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-md-medium text-foreground">{props.label}</span>
        <span className="text-sm-regular text-muted-foreground">{props.description}</span>
      </div>
      <div className="shrink-0">{props.children}</div>
    </div>
  )
}
