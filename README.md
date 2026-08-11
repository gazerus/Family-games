# Family Games

Video chat with the family, plus games you can add as you go — like Messenger's
video calls, but the games are ours.

Everyone opens the same link on their phone, picks a name, and lands in one
shared family room with three tabs: **Video**, **Chat**, and **Games**. No
accounts, no sign-up. Games so far:

- **Draw & Guess** — Pictionary-style: take turns drawing a secret word while
  everyone else guesses.
- **Memory Match** — flip cards to find matching pairs, most pairs wins.
- **Connect Four** — the classic, drop discs to line up four in a row.

## How it works, in short

- **Video/audio** rides [Daily.co](https://daily.co)'s free WebRTC service —
  no server of our own to run or pay for.
- **Chat and games ride the same connection**, using Daily's peer-to-peer data
  channel (`sendAppMessage`) instead of a separate backend. That's also why
  chat/games only reach people currently in the room — there's no server
  storing messages for later delivery (see "What this doesn't do" below).
- **The app itself is a static site** — a Vite + React PWA, installable to a
  phone's home screen, deployed for free on GitHub Pages.

## One-time setup (do this once, for the whole family)

1. Go to **[dashboard.daily.co](https://dashboard.daily.co)** and make a free
   account.
2. Click **Create room**. The defaults are fine — Daily's free tier easily
   covers a handful of family members.
3. Copy the room URL it gives you (looks like
   `https://yourname.daily.co/livingroom`).
4. Open the deployed app (see "Deploying" below) on your phone, and everyone
   else's — mum's phone, the girls' phones/tablets. Each device asks for a
   name and that same room link, once. After that it's remembered
   (`localStorage`), and opening the app just joins the room.

To use a different room later, or fix a typo, tap the small ⚙️ in the top
corner — it clears the saved name/room and shows the setup screen again.

## Adding the app to a phone's home screen

This is a PWA, so "installing" it doesn't need an app store:

- **Android (Chrome)**: open the site, tap the ⋮ menu → **Add to Home
  screen**.
- **iPhone (Safari)**: open the site, tap the Share icon → **Add to Home
  Screen**.

It then opens full-screen like a normal app.

## Adding a new game

Games are self-contained and register themselves in one place. To add one:

1. Create a folder under `src/games/<your-game>/` for its component(s).
2. For a turn-based game, build on `useHostGameState<YourStateType>("your-game-id",
   "game-over-phase-name")` (see `src/games/useHostGameState.ts`). Whoever
   taps "Start" becomes that session's authority: they compute the single
   source-of-truth state and broadcast it; everyone else just reflects it,
   and sends their moves back for the host to validate and apply. It also
   handles late joiners and lets a new host take over once a game ends. This
   is the same pattern all three current games use — see
   `src/games/memory/MemoryMatchGame.tsx` for the simplest example of it, or
   `src/games/connectfour/ConnectFourGame.tsx` for one with win detection.
   For anything that doesn't fit that shape, drop to the lower-level
   `useGameChannel<YourPayloadType>("your-game-id")` (see
   `src/games/useGameChannel.ts`) directly — `send`/`onMessage` scoped to
   your game's own messages, no host protocol assumed.
3. Export a component with the shape `({ onExit }: GameProps) => ...` (see
   `src/games/types.ts`) — call `onExit()` to return to the games hub.
4. Add it to the list in `src/games/registry.ts`. That's the only wiring
   needed; it shows up in the Games tab automatically.

`src/games/drawguess/` is the most involved worked example — turn-taking,
a synced canvas, scoring, and round timers, all layered on top of
`useHostGameState` with a couple of extra message types (the secret word,
sent privately to just the drawer; drawing strokes, sent to everyone).

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build       # outputs to dist/
```

Since there's no backend, `npm run dev` on one machine and a phone on the
same Daily room both "just work" — point the phone at your deployed version,
or run two browser tabs locally, to test multiplayer bits.

## Deploying (GitHub Pages)

`.github/workflows/deploy.yml` builds and deploys automatically on every push
to `main`. One-time repo setup: **Settings → Pages → Source → GitHub
Actions**. After that, the app is live at
`https://<your-github-username>.github.io/family-games/`.

The Vite `base` path in `vite.config.ts` is set to `/family-games/` to match
that URL — update it if you rename the repo.

## What this doesn't do (yet)

- **No push notifications.** If the app isn't open, nobody's notified you
  joined the room or sent a message — you just won't see it until you open
  the app. Genuinely "nice to have" push alerts (e.g. "Dad joined the family
  room") would need a small always-on relay; the reception-monitor sibling
  project in this GitHub account uses [ntfy.sh](https://ntfy.sh) for exactly
  that, free and serverless, and the same approach would drop in here if it's
  ever worth doing.
- **No chat/game history.** Nothing is stored anywhere — close the app and
  it's gone. Fine for a casual family room; would need a real backend (or
  something like Firebase) to change.
- **No automatic host handover.** In every game, whoever taps "Start game"
  runs that game's turn order and scoring for everyone else. If they drop
  out mid-game, it can stall — anyone can tap "Start game" again to begin a
  fresh one.
- **Connect Four is strictly 2-player** (it's just how the game works) and
  uses whichever two people happen to be in the room when it starts; anyone
  else currently in the call is a spectator for that game.
- **One shared room only.** There's no concept of multiple separate rooms or
  contacts list — it's built for one family, one room. Multiple rooms would
  mean adding a picker before the setup screen.
