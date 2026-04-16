import React, { useCallback, useEffect, useState } from "react"
import { Play } from "@phosphor-icons/react"
import { getSetting, setSetting, type SoundSettings, type SoundEventKey } from "../../lib/settings-store"
import { getAllSounds, type Sound } from "../../lib/sound-registry"
import { previewSound } from "../../lib/sound-player"
import { SettingCard } from "./setting-card"
import { SettingRow } from "./setting-row"
import { Slider } from "../ui/slider"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../ui/select"

const DEFAULTS: SoundSettings = {
  enabled: true,
  volume: 0.6,
  library: [],
  events: {
    agentResponse:       { enabled: true, soundId: "builtin:staplebops-01" },
    permissionRequest:   { enabled: true, soundId: "builtin:yup-03" },
    messageFailed:       { enabled: true, soundId: "builtin:nope-01" },
    mentionNotification: { enabled: true, soundId: "builtin:bip-bop-02" },
  },
}

const EVENT_META: { key: SoundEventKey; label: string; description: string }[] = [
  {
    key: "agentResponse",
    label: "Agent response complete",
    description: "Play when the agent finishes responding",
  },
  {
    key: "permissionRequest",
    label: "Permission request",
    description: "Play when the agent needs approval to use a tool",
  },
  {
    key: "messageFailed",
    label: "Message failed",
    description: "Play when a message fails to process",
  },
  {
    key: "mentionNotification",
    label: "Mentioned in session",
    description: "Play when the agent mentions you in a teamwork session",
  },
]

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${checked ? "bg-primary" : "bg-secondary"}`}
    >
      <span className={`pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  )
}

export function SettingsSounds() {
  const [settings, setSettings] = useState<SoundSettings>(DEFAULTS)
  const [catalog, setCatalog] = useState<Sound[]>([])

  const refreshCatalog = useCallback(async (library: SoundSettings["library"]) => {
    const all = await getAllSounds(library)
    setCatalog(all)
  }, [])

  useEffect(() => {
    void (async () => {
      const s = await getSetting("sounds")
      const merged = { ...DEFAULTS, ...s, events: { ...DEFAULTS.events, ...(s?.events ?? {}) } }
      setSettings(merged)
      await refreshCatalog(merged.library)
    })()
  }, [refreshCatalog])

  async function update(patch: Partial<SoundSettings>) {
    const fresh = (await getSetting("sounds")) ?? DEFAULTS
    const next: SoundSettings = { ...fresh, ...patch, events: patch.events ?? fresh.events }
    setSettings(next)
    await setSetting("sounds", next)
    window.dispatchEvent(new CustomEvent("settings-changed"))
  }

  async function updateEvent(key: SoundEventKey, patch: Partial<SoundSettings["events"][SoundEventKey]>) {
    const fresh = (await getSetting("sounds")) ?? DEFAULTS
    const events = { ...fresh.events, [key]: { ...fresh.events[key], ...patch } }
    const next: SoundSettings = { ...fresh, events }
    setSettings(next)
    await setSetting("sounds", next)
    window.dispatchEvent(new CustomEvent("settings-changed"))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── General ────────────────────────────────────────────── */}
      <SettingCard title="General">
        <SettingRow label="Enable sounds" description="Play audio cues for background events">
          <Toggle checked={settings.enabled} onChange={(v) => void update({ enabled: v })} />
        </SettingRow>
        <SettingRow label="Volume" description="Applies to all sound effects">
          <div className="flex items-center gap-3 w-48">
            <Slider
              value={[Math.round(settings.volume * 100)]}
              min={0}
              max={100}
              step={1}
              onValueChange={(vals) => void update({ volume: (vals[0] ?? 0) / 100 })}
              disabled={!settings.enabled}
              aria-label="Sound volume"
            />
            <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{Math.round(settings.volume * 100)}%</span>
          </div>
        </SettingRow>
      </SettingCard>

      {/* ── Events ─────────────────────────────────────────────── */}
      <SettingCard title="Events">
        {EVENT_META.map((meta) => {
          const ev = settings.events[meta.key]
          return (
            <SettingRow key={meta.key} label={meta.label} description={meta.description}>
              <div className="flex items-center gap-2">
                <Select
                  value={ev.soundId}
                  onValueChange={(soundId) => void updateEvent(meta.key, { soundId })}
                  disabled={!settings.enabled || !ev.enabled}
                >
                  <SelectTrigger className="w-44" aria-label={`${meta.label} sound`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Built-in</SelectLabel>
                      {catalog.filter((s) => s.source === "builtin").map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectGroup>
                    {catalog.some((s) => s.source === "imported") && (
                      <SelectGroup>
                        <SelectLabel>Imported</SelectLabel>
                        {catalog.filter((s) => s.source === "imported").map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  className="size-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => void previewSound(ev.soundId)}
                  disabled={!settings.enabled || !ev.enabled}
                  aria-label={`Preview ${meta.label} sound`}
                  title="Preview"
                >
                  <Play size={16} weight="fill" />
                </button>
                <Toggle
                  checked={ev.enabled}
                  onChange={(v) => void updateEvent(meta.key, { enabled: v })}
                  disabled={!settings.enabled}
                />
              </div>
            </SettingRow>
          )
        })}
      </SettingCard>
    </div>
  )
}
