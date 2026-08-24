import { useEffect, useRef, useState } from "react";
import { useHostGameState } from "../useHostGameState";
import type { GameProps } from "../types";
import { colorForPlayerIndex } from "../playerColors";
import { PlayingCard } from "../PlayingCard";
import type { Card } from "../deck";
import {
  applyPlayToCentre,
  applyPlayToSide,
  canPlayToCentreStack,
  dealNewGame,
  type EnginePlayer,
  type EngineState,
  type Phase,
  type PlaySource,
} from "./engine";

const GAME_ID = "spite-and-malice";

interface FeedEvent {
  id: string;
  text: string;
}

interface PublicState {
  phase: Phase;
  hostId: string;
  players: EnginePlayer[];
  currentPlayerId: string;
  handCounts: Record<string, number>;
  payoffTops: Record<string, Card | null>;
  payoffCounts: Record<string, number>;
  sideStacks: Record<string, (Card[] | null)[]>;
  centreStacks: (Card[] | null)[];
  stockCount: number;
  winnerId: string | null;
  lastEvent: FeedEvent | null;
}

interface HandPayload {
  hand: Card[];
}

interface CentrePayload {
  source: PlaySource;
  centreIdx: number;
}

interface SidePayload {
  source: PlaySource;
  sideIdx: number;
}

type SpiteMalicePayload = PublicState | HandPayload | CentrePayload | SidePayload | Record<string, never>;

function publicStateFrom(engine: EngineState, hostId: string): PublicState {
  const payoffTops: Record<string, Card | null> = {};
  const payoffCounts: Record<string, number> = {};
  for (const p of engine.players) {
    const pile = engine.payoffPiles[p.sessionId];
    payoffTops[p.sessionId] = pile.length > 0 ? pile[pile.length - 1] : null;
    payoffCounts[p.sessionId] = pile.length;
  }
  return {
    phase: engine.phase,
    hostId,
    players: engine.players,
    currentPlayerId: engine.currentPlayerId,
    handCounts: Object.fromEntries(engine.players.map((p) => [p.sessionId, engine.hands[p.sessionId].length])),
    payoffTops,
    payoffCounts,
    sideStacks: engine.sideStacks,
    centreStacks: engine.centreStacks,
    stockCount: engine.stock.length,
    winnerId: engine.winnerId,
    lastEvent: engine.lastEventText ? { id: `${Date.now()}-${Math.random()}`, text: engine.lastEventText } : null,
  };
}

function sourceCard(source: PlaySource, myHand: Card[], myPayoffTop: Card | null, mySideStacks: (Card[] | null)[]): Card | null {
  if (source.type === "hand") return myHand.find((c) => c.id === source.cardId) ?? null;
  if (source.type === "payoff") return myPayoffTop;
  const stack = mySideStacks[source.stackIdx];
  return stack && stack.length > 0 ? stack[stack.length - 1] : null;
}

function sourcesEqual(a: PlaySource | null, b: PlaySource): boolean {
  if (!a || a.type !== b.type) return false;
  if (a.type === "hand" && b.type === "hand") return a.cardId === b.cardId;
  if (a.type === "side" && b.type === "side") return a.stackIdx === b.stackIdx;
  return a.type === "payoff" && b.type === "payoff";
}

export function SpiteAndMaliceGame({ onExit }: GameProps) {
  const {
    state,
    isHost,
    startAsHost,
    updateState,
    send,
    onMessage,
    localSessionId,
    presentPlayers,
  } = useHostGameState<PublicState, SpiteMalicePayload>(GAME_ID, "game-over");

  const [myHand, setMyHand] = useState<Card[]>([]);
  const [selectedSource, setSelectedSource] = useState<PlaySource | null>(null);
  const engineRef = useRef<EngineState | null>(null);

  function sendHand(playerId: string, hand: Card[]) {
    if (playerId === localSessionId) setMyHand(hand);
    else send("hand", { hand }, playerId);
  }

  function commit(engine: EngineState) {
    engineRef.current = engine;
    for (const p of engine.players) sendHand(p.sessionId, engine.hands[p.sessionId]);
    updateState(publicStateFrom(engine, localSessionId ?? ""));
  }

  useEffect(() => {
    return onMessage((type, payload, senderId) => {
      if (type === "hand") {
        setMyHand((payload as HandPayload).hand);
        return;
      }
      if (!isHost || !engineRef.current) return;
      if (type === "request-state") {
        const hand = engineRef.current.hands[senderId];
        if (hand) sendHand(senderId, hand);
        return;
      }
      if (type === "play-centre") {
        const { source, centreIdx } = payload as CentrePayload;
        commit(applyPlayToCentre(engineRef.current, senderId, source, centreIdx));
        return;
      }
      if (type === "play-side") {
        const { source, sideIdx } = payload as SidePayload;
        commit(applyPlayToSide(engineRef.current, senderId, source, sideIdx));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMessage, isHost]);

  function startGame() {
    const order = presentPlayers.slice(0, 2).map((p) => ({ sessionId: p.sessionId, name: p.userName }));
    if (order.length < 2) return;
    const engine = dealNewGame(order);
    engineRef.current = engine;
    setSelectedSource(null);
    for (const p of order) sendHand(p.sessionId, engine.hands[p.sessionId]);
    startAsHost(publicStateFrom(engine, localSessionId ?? ""));
  }

  const myTurn = state?.currentPlayerId === localSessionId;
  const opponent = state?.players.find((p) => p.sessionId !== localSessionId);
  const myPayoffTop = state?.payoffTops[localSessionId ?? ""] ?? null;
  const mySideStacks = state?.sideStacks[localSessionId ?? ""] ?? [null, null, null, null];

  function selectSource(source: PlaySource) {
    if (!myTurn) return;
    setSelectedSource((prev) => (sourcesEqual(prev, source) ? null : source));
  }

  function playToCentre(centreIdx: number) {
    if (!state || !myTurn || !selectedSource) return;
    if (isHost && engineRef.current) {
      commit(applyPlayToCentre(engineRef.current, localSessionId ?? "", selectedSource, centreIdx));
    } else {
      send("play-centre", { source: selectedSource, centreIdx });
    }
    setSelectedSource(null);
  }

  function playToSide(sideIdx: number) {
    if (!state || !myTurn || !selectedSource) return;
    if (selectedSource.type === "side") return; // side-to-side isn't legal
    if (isHost && engineRef.current) {
      commit(applyPlayToSide(engineRef.current, localSessionId ?? "", selectedSource, sideIdx));
    } else {
      send("play-side", { source: selectedSource, sideIdx });
    }
    setSelectedSource(null);
  }

  if (!state) {
    return (
      <div className="dg-lobby">
        <h2>♠️ Spite &amp; Malice</h2>
        <p>Race to clear your 20-card pay-off pile first. Build centre stacks Ace to Queen — Kings are wild.</p>
        {presentPlayers.length < 2 ? (
          <p className="dg-hint">Need at least 2 people to have this game open.</p>
        ) : (
          <p className="dg-hint">
            {presentPlayers.length} people ready. Whoever starts runs the first game.
          </p>
        )}
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Start game
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  if (state.phase === "game-over") {
    const winner = state.players.find((p) => p.sessionId === state.winnerId);
    return (
      <div className="dg-lobby">
        <h2>{winner ? `🏆 ${winner.name} wins!` : "🤝 It's a draw!"}</h2>
        <button className="primary-button" onClick={startGame} disabled={presentPlayers.length < 2}>
          Play again
        </button>
        <button className="link-button" onClick={onExit}>
          Back to games
        </button>
      </div>
    );
  }

  const selectedCard = selectedSource ? sourceCard(selectedSource, myHand, myPayoffTop, mySideStacks) : null;
  const centreHighlights = state.centreStacks.map((stack) => (selectedCard ? canPlayToCentreStack(selectedCard, stack) : false));
  const sideEnabled = myTurn && !!selectedSource && selectedSource.type !== "side";

  return (
    <div className="sm-game">
      <div className="dg-header">
        <button className="link-button dg-exit" onClick={onExit}>
          ← Games
        </button>
        <div className="sm-turn-banner">{myTurn ? "Your turn" : `${opponent?.name}'s turn`}</div>
      </div>

      {state.lastEvent && (
        <div className="sm-feed" key={state.lastEvent.id}>
          {state.lastEvent.text}
        </div>
      )}

      {opponent && (
        <div className="sm-player-row">
          <span className="sm-player-label" style={{ color: colorForPlayerIndex(1) }}>
            {opponent.name} · hand: {state.handCounts[opponent.sessionId] ?? 0}
          </span>
          <div className="sm-piles">
            <div className="sm-payoff">
              <PlayingCard
                card={state.payoffTops[opponent.sessionId] ?? { id: -1, rank: "A", suit: "♠" }}
                faceDown={!state.payoffTops[opponent.sessionId]}
              />
              <span className="sm-pile-count">{state.payoffCounts[opponent.sessionId] ?? 0} left</span>
            </div>
            <div className="sm-side-stacks">
              {(state.sideStacks[opponent.sessionId] ?? []).map((stack, idx) => (
                <SideSlot key={idx} stack={stack} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="sm-centre-row">
        {state.centreStacks.map((stack, idx) => (
          <button
            key={idx}
            className={`sm-centre-slot ${centreHighlights[idx] ? "sm-centre-slot--highlight" : ""}`}
            onClick={() => playToCentre(idx)}
            disabled={!myTurn || !selectedSource || !centreHighlights[idx]}
          >
            {stack && stack.length > 0 ? (
              <>
                <PlayingCard card={stack[stack.length - 1]} />
                <span className="sm-centre-count">{stack.length}/12</span>
              </>
            ) : (
              <span className="sm-centre-empty">Ace</span>
            )}
          </button>
        ))}
      </div>

      <div className="sm-player-row">
        <span className="sm-player-label" style={{ color: colorForPlayerIndex(0) }}>
          You · {state.stockCount} in stock
        </span>
        <div className="sm-piles">
          <div className="sm-payoff">
            <PlayingCard
              card={myPayoffTop ?? { id: -1, rank: "A", suit: "♠" }}
              faceDown={!myPayoffTop}
              highlighted={sourcesEqual(selectedSource, { type: "payoff" })}
              onClick={myPayoffTop ? () => selectSource({ type: "payoff" }) : undefined}
            />
            <span className="sm-pile-count">{state.payoffCounts[localSessionId ?? ""] ?? 0} left</span>
          </div>
          <div className="sm-side-stacks">
            {mySideStacks.map((stack, idx) => (
              <SideSlot
                key={idx}
                stack={stack}
                interactive
                selected={sourcesEqual(selectedSource, { type: "side", stackIdx: idx })}
                playable={sideEnabled}
                onClick={() => {
                  if (sideEnabled) playToSide(idx);
                  else if (stack && stack.length > 0) selectSource({ type: "side", stackIdx: idx });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="sm-my-hand">
        {myHand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            highlighted={sourcesEqual(selectedSource, { type: "hand", cardId: card.id })}
            onClick={() => selectSource({ type: "hand", cardId: card.id })}
          />
        ))}
      </div>
    </div>
  );
}

function SideSlot({
  stack,
  interactive = false,
  selected = false,
  playable = false,
  onClick,
}: {
  stack: Card[] | null;
  interactive?: boolean;
  selected?: boolean;
  playable?: boolean;
  onClick?: () => void;
}) {
  const hasCards = !!stack && stack.length > 0;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      className={`sm-side-slot ${selected ? "sm-side-slot--selected" : ""} ${playable ? "sm-side-slot--playable" : ""}`}
      onClick={interactive ? onClick : undefined}
      disabled={interactive && !hasCards && !playable}
    >
      {hasCards ? (
        <>
          <PlayingCard card={stack[stack.length - 1]} />
          {stack.length > 1 && <span className="sm-side-count">{stack.length}</span>}
        </>
      ) : (
        <span className="sm-side-empty" />
      )}
    </Tag>
  );
}
