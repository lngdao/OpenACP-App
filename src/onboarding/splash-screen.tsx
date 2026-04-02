export function SplashScreen() {
  return (
    <div class="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950">
      <img
        src="/icons/icon.png"
        alt="OpenACP"
        class="mb-8 h-16 w-16 rounded-2xl"
      />
      <div class="flex gap-1.5">
        <span class="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
        <span class="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
        <span class="h-2 w-2 animate-bounce rounded-full bg-neutral-400" />
      </div>
    </div>
  );
}
