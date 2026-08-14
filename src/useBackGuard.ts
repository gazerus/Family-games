import { useEffect, useRef, useState } from "react";

/**
 * Traps the browser/Android back button so a stray press never yanks a kid
 * straight out of a live call — there's no real navigation history in this
 * app (no router), so without this a back press just leaves the page.
 *
 * Works by keeping one extra "guard" history entry pushed at all times.
 * A back press pops it, our popstate handler reacts (exit the game, cancel
 * editing, or ask before leaving) and immediately re-pushes the guard —
 * pushState after a pop always replaces the discarded forward entry, so the
 * stack never grows. Only a confirmed "Leave" bypasses the re-push and lets
 * the real back navigation (or, if there's nothing left to go back to, the
 * OS's normal app-close/minimize) proceed.
 *
 * `enabled` gates all of this on there actually being something to protect
 * (a joined room) — before that, back behaves like a normal web page.
 */
export function useBackGuard({
  enabled,
  activeGameId,
  setActiveGameId,
  editing,
  setEditing,
}: {
  enabled: boolean;
  activeGameId: string | null;
  setActiveGameId: (id: string | null) => void;
  editing: boolean;
  setEditing: (value: boolean) => void;
}) {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const allowExitRef = useRef(false);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!enabled || pushedRef.current) return;
    pushedRef.current = true;
    history.pushState({ appGuard: true }, "", location.href);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    function handlePopState() {
      if (allowExitRef.current) {
        allowExitRef.current = false;
        return;
      }
      if (activeGameId) {
        setActiveGameId(null);
      } else if (editing) {
        setEditing(false);
      } else {
        setShowExitConfirm(true);
      }
      history.pushState({ appGuard: true }, "", location.href);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [enabled, activeGameId, editing, setActiveGameId, setEditing]);

  function confirmExit() {
    allowExitRef.current = true;
    setShowExitConfirm(false);
    history.back();
  }

  function cancelExit() {
    setShowExitConfirm(false);
  }

  return { showExitConfirm, confirmExit, cancelExit };
}
