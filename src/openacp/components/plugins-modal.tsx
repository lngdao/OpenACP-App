import { createSignal, Show } from "solid-js"
import { Tabs } from "@openacp/ui/tabs"
import { InstalledTab } from "./plugins-installed"
import { MarketplaceTab } from "./plugins-marketplace"
import { useWorkspace } from "../context/workspace"

interface Props {
  open: boolean
  onClose: () => void
}

export function PluginsModal(props: Props) {
  const workspace = useWorkspace()
  const [activeTab, setActiveTab] = createSignal<"installed" | "marketplace">("installed")

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div class="bg-background-weak w-[720px] max-h-[560px] flex flex-col rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border-base">
            <h2 class="text-16-semibold text-text-strong">Plugins</h2>
            <button
              type="button"
              onClick={props.onClose}
              class="text-text-weak hover:text-text-base text-xl leading-none transition-colors"
            >
              &times;
            </button>
          </div>

          <Tabs
            value={activeTab()}
            onChange={setActiveTab}
            class="flex flex-col flex-1 min-h-0"
          >
            <Tabs.List class="shrink-0 px-4">
              <Tabs.Trigger value="installed">Installed</Tabs.Trigger>
              <Tabs.Trigger value="marketplace">Marketplace</Tabs.Trigger>
            </Tabs.List>

            <div class="flex-1 min-h-0 overflow-y-auto">
              <Tabs.Content value="installed">
                <InstalledTab workspace={workspace} />
              </Tabs.Content>
              <Tabs.Content value="marketplace">
                <MarketplaceTab workspace={workspace} />
              </Tabs.Content>
            </div>
          </Tabs>
        </div>
      </div>
    </Show>
  )
}
