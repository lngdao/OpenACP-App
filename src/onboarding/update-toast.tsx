import { createSignal, onMount, Show } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';
import { check as checkAppUpdate } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface CoreUpdate {
  current: string;
  latest: string;
}

export function UpdateToasts() {
  const [coreUpdate, setCoreUpdate] = createSignal<CoreUpdate | null>(null);
  const [appUpdateAvailable, setAppUpdateAvailable] = createSignal(false);
  const [coreUpdating, setCoreUpdating] = createSignal(false);
  const [appUpdating, setAppUpdating] = createSignal(false);
  const [coreUpdateError, setCoreUpdateError] = createSignal('');

  onMount(async () => {
    // Check core update
    try {
      const result = await invoke<CoreUpdate | null>('check_core_update');
      if (result) setCoreUpdate(result);
    } catch {
      // silent fail
    }

    // Check app update
    try {
      const update = await checkAppUpdate();
      if (update?.available) setAppUpdateAvailable(true);
    } catch {
      // silent fail
    }
  });

  const updateCore = async () => {
    setCoreUpdating(true);
    setCoreUpdateError('');
    try {
      await invoke('run_install_script');
      setCoreUpdate(null);
    } catch (err) {
      setCoreUpdateError(String(err));
    } finally {
      setCoreUpdating(false);
    }
  };

  const updateApp = async () => {
    setAppUpdating(true);
    try {
      const update = await checkAppUpdate();
      if (update?.available) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } finally {
      setAppUpdating(false);
    }
  };

  return (
    <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <Show when={coreUpdate()}>
        {(info) => (
          <Toast
            message={`OpenACP Core ${info().latest} available`}
            loading={coreUpdating()}
            onUpdate={updateCore}
            onDismiss={() => setCoreUpdate(null)}
            error={coreUpdateError()}
          />
        )}
      </Show>
      <Show when={appUpdateAvailable()}>
        <Toast
          message="OpenACP App update available"
          loading={appUpdating()}
          onUpdate={updateApp}
          onDismiss={() => setAppUpdateAvailable(false)}
        />
      </Show>
    </div>
  );
}

function Toast(props: {
  message: string;
  loading: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
  error?: string;
}) {
  return (
    <div class="pointer-events-auto flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-lg">
      <div class="flex flex-col gap-1">
        <span class="text-sm text-neutral-200">{props.message}</span>
        <Show when={props.error}><p class="text-xs text-red-400">{props.error}</p></Show>
      </div>
      <button
        onClick={props.onUpdate}
        disabled={props.loading}
        class="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {props.loading ? 'Updating...' : 'Update'}
      </button>
      <button
        onClick={props.onDismiss}
        class="text-neutral-500 hover:text-neutral-300"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
