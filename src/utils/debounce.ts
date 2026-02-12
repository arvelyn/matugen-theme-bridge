// src/utils/debounce.ts
// Generic debounce utility — framework-free, no external deps.

/**
 * Returns a debounced version of `fn`.
 * Calls are coalesced: only the last call within `delayMs` is executed.
 *
 * Usage:
 *   const debouncedApply = debounce(() => applyPalette(), 300);
 *   fsWatcher.on("change", debouncedApply);
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<T>): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  };
}
