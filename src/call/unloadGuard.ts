/**
 * Coordinates the "are you sure you want to leave?" warnings so you only
 * ever get asked once.
 *
 * CallProvider asks the browser to confirm before the page unloads (an
 * accidental tab close, refresh, or swipe-back during a call). But the back
 * button has its own in-app confirmation in useBackGuard, and confirming
 * *that* ends in a real navigation — which would trip the browser's prompt
 * straight after, asking a second time about a decision already made. So a
 * confirmed in-app exit waives the next one.
 */
let unloadAllowed = false;

/** Called once the user has already confirmed they're leaving. */
export function allowNextUnload(): void {
  unloadAllowed = true;
}

export function shouldWarnBeforeUnload(): boolean {
  return !unloadAllowed;
}
