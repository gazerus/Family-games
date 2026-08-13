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
- **Snakes & Ladders** — roll an animated dice, race to square 100, 10
  ladders and 10 snakes to keep it swingy. Supports 2-4 players.
- **Critter Cards** — a simple animal-themed color/number matching card
  game in the same spirit as UNO Junior: Skip, Reverse, Draw 2, and Wild
  cards, first to empty their hand wins, no cross-game scoring. Supports
  2-4 players.
- **Battleship** — classic hidden-fleet naval combat, fire at coordinates
  to sink the other person's ships first. 2 players.
- **Maze Race** — each player picks their own difficulty and races their own
  maze to the exit, side by side with a live view of the other person's
  progress. Grab ⚡ speed boosts and 👁️ path reveals along the way. 2 players.
- **Fishing Compete** — each player fishes their own pond, tuned to their own
  difficulty; race to a score threshold or see who catches the most in 60
  seconds. Rare gold fish are worth more. 2 players.

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

## Getting the Android app (APK)

If you'd rather hand someone an installable app than a web link, Android
has that option — **iPhone doesn't** (Apple doesn't allow installing
apps outside the App Store this way, so iPhone family members should stick
to the web link above instead; it's fully capable, this is just an
alternative for Android).

1. Grab the latest build from this repo's
   [Releases page](https://github.com/gazerus/Family-games/releases/tag/android-latest)
   — always the file named `family-games.apk`. It rebuilds automatically
   from `main` (see `.github/workflows/build-apk.yml`), so that one link is
   always the newest version.
2. Send that `.apk` file to the phone however's easiest — email, a chat
   app, a USB cable, Google Drive.
3. Open it on the phone. Android will ask to allow installing from that
   source the first time (Settings will prompt you directly if you just
   tap the file) — that's a one-time permission per app source, not an
   account or sign-up.
4. Open the installed app, paste the Daily.co room link once, and you're
   in — same as the web version from here.

Once installed, the app runs entirely from what's bundled inside the APK;
it doesn't talk to GitHub (or need a browser) at all after that first
install. The only thing it ever calls out to is Daily.co, for the actual
video/game connection.

**The trade-off versus the web link**: no auto-updates. The web version
updates itself the instant it's redeployed; the APK only updates when
someone downloads a fresh copy and reinstalls over the old one. Fine for
occasional updates, just not instant.

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

**Hidden information** (a hand of cards/tiles nobody else should see): the
public `state` from `useHostGameState` should only ever hold what everyone
is allowed to know (e.g. hand *sizes*, not contents). The host keeps the
real data in a plain ref (not React state, so it never gets broadcast) and
pushes each player's own slice of it to them with a targeted
`send("hand", { hand }, theirSessionId)` — same idea as Draw & Guess's
secret word, just per-player instead of per-drawer. `src/games/battleship/`
and `src/games/crittercards/` are the fullest worked examples of this: both
also show the "declare your move, host validates and applies it" pattern
for actions the acting player can't safely resolve themselves (they don't
know what's in the deck/boneyard either).

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
`https://<your-github-username>.github.io/<exact-repo-name>/`.

The Vite `base` path in `vite.config.ts` (and `start_url`/`scope` in the PWA
manifest just above it) must exactly match your repo's name, **including
case** — GitHub Pages URLs are case-sensitive. This repo is
`gazerus/Family-games` (capital F), so `base` is `/Family-games/`; if you
rename the repo, update all three to match exactly or the deployed app will
load a blank page (index.html loads, but its JS/CSS asset paths 404).

## Building the Android app yourself

Normally you don't need to — the GitHub Actions workflow above does this
on every push and publishes the result. This is only for building it
locally (e.g. to test on a plugged-in device before pushing):

```bash
npm run build:apk       # capacitor-mode web build (root-relative paths)
npx cap sync android     # copies it into android/, updates native config
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Needs a JDK (17+) and the Android SDK installed locally — Android Studio
gives you both, or `npx cap open android` opens the project there directly
if it can find your install. Both build targets (`npm run build` for
Pages, `npm run build:apk` for the APK) come from the same `src/` — see
the comment at the top of `vite.config.ts` for why they need different
settings.

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
  runs that game's turn order and scoring for everyone else — everyone
  else's game screen resyncs to them automatically, including if they
  switch tabs and come back mid-game. But if the *host specifically*
  navigates away and back (or drops out), their own client forgets it was
  hosting, and nobody automatically takes over — anyone can tap "Start
  game" again to begin a fresh one.
- **Connect Four is strictly 2-player** (it's just how the game works) and
  uses whichever two people happen to be in the room when it starts; anyone
  else currently in the call is a spectator for that game.
- **One shared room only.** There's no concept of multiple separate rooms or
  contacts list — it's built for one family, one room. Multiple rooms would
  mean adding a picker before the setup screen.
