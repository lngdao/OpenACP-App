import React, { useEffect, useState } from "react"
import { getSetting, setSetting } from "../../lib/settings-store"

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  zh: "Chinese (Simplified)",
  zht: "Chinese (Traditional)",
  ko: "Korean",
  de: "German",
  es: "Spanish",
  fr: "French",
  da: "Danish",
  ja: "Japanese",
  pl: "Polish",
  ru: "Russian",
  ar: "Arabic",
  no: "Norwegian",
  br: "Portuguese (Brazil)",
  bs: "Bosnian",
}

export function SettingsGeneral(props: { workspacePath: string }) {
  const [language, setLanguage] = useState("en")

  useEffect(() => {
    void getSetting("language").then(setLanguage)
  }, [])

  async function handleLanguageChange(value: string) {
    setLanguage(value)
    await setSetting("language", value)
  }

  return (
    <div data-component="oac-settings" className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg-medium text-foreground mb-1">General</h2>
        <p className="text-sm-regular text-muted-foreground">Basic application settings</p>
      </div>

      <SettingRow label="Language" description="Choose the display language for the app">
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm-regular text-foreground-weak focus:outline-none focus:ring-1 focus:ring-border-selected min-w-[160px]"
          value={language}
          onChange={(e) => void handleLanguageChange(e.target.value)}
        >
          {Object.entries(LOCALE_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow label="Workspace folder" description="Current workspace data location">
        <div className="flex items-center gap-2">
          <code className="text-sm-regular text-foreground-weak font-mono bg-secondary px-2 py-1 rounded-md max-w-[300px] truncate">
            {props.workspacePath || "No workspace selected"}
          </code>
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
