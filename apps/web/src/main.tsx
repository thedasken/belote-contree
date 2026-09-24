import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RoomSocket,
  clearSession,
  loadSession,
  roomRequest,
  saveSession,
} from "./transport";
import type { Room } from "./transport";
import {
  currentTrick,
  relativePosition,
  shouldHighlightHand,
  sortHand,
  turnMessage,
} from "./hand-order";
import {
  AUCTION_LABELS,
  cardIllustrationId,
  cardLabel,
  SUIT_LABELS,
} from "./labels";
import "./style.css";
type Card = import("./main-types").Card;
type GameView = {
  phase: string;
  seat: number;
  dealerSeat: number;
  hand: Card[];
  legalCards: Card[];
  biddingActions: string[];
  bidValues: Array<number | "CAPOT">;
  trumpSuits: Card["suit"][];
  biddingPhase: string | null;
  activeSeat: number | null;
  scores: { A: number; B: number };
  contract: {
    bid: {
      value: number | "CAPOT";
      trumpSuit: Card["suit"];
      bidderSeat: number;
    };
    team: "A" | "B";
    status: string;
  } | null;
  publicTricks: Array<{
    cards: Array<{ seat: number; card: Card }>;
    winner: number | null;
  }>;
  completedTrickCount: number;
  lastTrick: {
    cards: Array<{ seat: number; card: Card }>;
    winner: number | null;
  } | null;
  dealResult: {
    contractMade: boolean;
    assignedScore: { A: number; B: number };
    beloteBonus: { A: number; B: number };
  } | null;
};
const labels = ["Nord", "Est", "Sud", "Ouest"];
function App() {
  const [session, setSession] = useState(loadSession());
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [game, setGame] = useState<GameView | null>(null);
  const [gameVersion, setGameVersion] = useState(0);
  const [sendGame, setSendGame] = useState<((message: unknown) => void) | null>(
    null,
  );
  const [paused, setPaused] = useState(false);
  const latestVersion = useRef(0);
  useEffect(() => {
    if (!session) return;
    fetch(
      `${import.meta.env.VITE_API_URL || window.location.origin}/rooms/${session.code}`,
    )
      .then((r) => r.json())
      .then(setRoom)
      .catch(() => setError("Serveur inaccessible"));
    const ws = new RoomSocket(
      session.code,
      session.token,
      (m) => {
        if ((m as { type: string }).type === "ROOM_STATE")
          setRoom((m as { state: Room }).state);
        if ((m as { type: string }).type === "SESSION_PAUSED") setPaused(true);
        if ((m as { type: string }).type === "SESSION_RESUMED") setPaused(true);
        if ((m as { type: string }).type === "GAME_STATE") {
          const message = m as { version: number; state: GameView };
          if (message.version >= latestVersion.current) {
            latestVersion.current = message.version;
            setGameVersion(message.version);
            setGame(message.state);
            setPaused(false);
          }
        }
      },
      setStatus,
    );
    setSendGame(() => (message: unknown) => ws.send(message));
    ws.connect();
    return () => {
      ws.close();
      setSendGame(null);
    };
  }, [session]);
  if (!session || !room)
    return (
      <Home
        onEnter={(s) => {
          saveSession(s);
          setSession(s);
        }}
        error={error}
        setError={setError}
      />
    );
  if (room.phase === "PLAYING")
    return (
      <Game
        room={room}
        game={game}
        version={gameVersion}
        send={sendGame}
        paused={paused}
        onLeave={() => {
          clearSession();
          setSession(null);
        }}
      />
    );
  return (
    <Lobby
      room={room}
      session={session}
      status={status}
      setRoom={setRoom}
      onLeave={() => {
        clearSession();
        setSession(null);
      }}
      setError={setError}
      error={error}
    />
  );
}
function Home({
  onEnter,
  error,
  setError,
}: {
  onEnter: (s: { code: string; participantId: string; token: string }) => void;
  error: string;
  setError: (s: string) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(join: boolean) {
    if (nickname.trim().length < 1 || nickname.trim().length > 32)
      return setError("Le pseudo doit contenir entre 1 et 32 caractères.");
    if (join && !/^[A-Z2-9]{8}$/.test(code.toUpperCase()))
      return setError("Code de salon incorrect.");
    setBusy(true);
    setError("");
    try {
      const x = await roomRequest(
        join ? `/rooms/${code.toUpperCase()}` + "/join" : "/rooms",
        { nickname },
      );
      onEnter(x);
    } catch (e) {
      setError(
        (e as Error).message === "ROOM_FULL"
          ? "Salon complet ou déjà démarré."
          : "Impossible de joindre le serveur ou le salon.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="home">
      <section className="card">
        <p className="eyebrow">BELOTE CONTRÉE</p>
        <h1>Une partie entre amis.</h1>
        <p>Choisissez un pseudo temporaire pour entrer à table.</p>
        <input
          aria-label="Pseudo"
          placeholder="Votre pseudo"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <div className="actions">
          <button disabled={busy} onClick={() => submit(false)}>
            Créer une partie
          </button>
          <div className="join">
            <input
              aria-label="Code du salon"
              placeholder="CODE DU SALON"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              className="secondary"
              disabled={busy}
              onClick={() => submit(true)}
            >
              Rejoindre
            </button>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
function Lobby({
  room,
  session,
  status,
  setRoom,
  onLeave,
  setError,
  error,
}: {
  room: Room;
  session: { token: string; participantId: string };
  status: string;
  setRoom: (r: Room) => void;
  onLeave: () => void;
  setError: (s: string) => void;
  error: string;
}) {
  const owner = room.ownerId === session.participantId;
  async function assign(id: string, seat: number, team: "A" | "B") {
    try {
      const r = await roomRequest(`/rooms/${room.code}/assign`, {
        token: session.token,
        participantId: id,
        seat,
        team,
      });
      setRoom((r as unknown as { room?: Room }).room ?? (r as unknown as Room));
    } catch {
      setError("Cette place n'est plus disponible.");
    }
  }
  async function start() {
    try {
      const r = await roomRequest(`/rooms/${room.code}/start`, {
        token: session.token,
      });
      setRoom((r as unknown as { room?: Room }).room ?? (r as unknown as Room));
    } catch {
      setError("La partie n'est pas prête.");
    }
  }
  const ready =
    room.participants.length === 4 &&
    new Set(room.participants.map((p) => p.team)).size === 2;
  return (
    <main className="table">
      <header>
        <div>
          <p className="eyebrow">SALON PRIVÉ</p>
          <h1>{room.code}</h1>
        </div>
        <button
          className="secondary"
          onClick={() => navigator.clipboard?.writeText(room.code)}
        >
          Copier le code
        </button>
      </header>
      <p className="connection">
        {status === "connected" ? "● Connecté" : "○ Reconnexion…"}
      </p>
      <section className="seats">
        {[0, 1, 2, 3].map((seat) => {
          const p = room.participants.find((x) => x.seat === seat);
          return (
            <article className="seat" key={seat}>
              <span>{labels[seat]}</span>
              <strong>{p?.nickname ?? "Place libre"}</strong>
              {p && (
                <small>
                  {p.connected ? "En ligne" : "Hors ligne"} · Équipe {p.team}
                </small>
              )}
              {owner && p && (
                <div>
                  <select
                    value={p.team}
                    onChange={(e) =>
                      assign(p.id, p.seat, e.target.value as "A" | "B")
                    }
                  >
                    <option>A</option>
                    <option>B</option>
                  </select>
                  <select
                    value={p.seat}
                    onChange={(e) =>
                      assign(p.id, Number(e.target.value), p.team)
                    }
                  >
                    {[0, 1, 2, 3].map((x) => (
                      <option key={x} value={x}>
                        {labels[x]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </article>
          );
        })}
      </section>
      <footer>
        <p>{room.participants.length}/4 joueurs · Équipes A et B</p>
        {owner && (
          <button disabled={!ready} onClick={start}>
            Démarrer la partie
          </button>
        )}
        <button className="link" onClick={onLeave}>
          Quitter
        </button>
      </footer>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
function Game({
  room,
  game,
  version,
  send,
  paused,
  onLeave,
}: {
  room: Room;
  game: GameView | null;
  version: number;
  send: ((message: unknown) => void) | null;
  paused: boolean;
  onLeave: () => void;
}) {
  const [error, setError] = useState("");
  const [bidValue, setBidValue] = useState<number | "CAPOT">(80);
  const [trump, setTrump] = useState<Card["suit"]>("SPADES");
  const [busy, setBusy] = useState(false);
  const previousGame = useRef<GameView | null>(null);
  const previousTrickGame = useRef<GameView | null>(null);
  const trickTimer = useRef(0);
  const [displayedTrick, setDisplayedTrick] = useState<
    GameView["publicTricks"][number] | null
  >(null);
  const [trickLeaving, setTrickLeaving] = useState(false);
  const [dealAnimation, setDealAnimation] = useState(0);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const previous = previousTrickGame.current;
    if (previous && previous.hand.length === 0 && game?.hand.length === 8)
      setDealAnimation((value) => value + 1);
    if (
      previous &&
      game &&
      previous.contract?.status !== game.contract?.status
    ) {
      setFeedback(
        game.contract?.status === "COINCHE"
          ? "Contre annoncé"
          : game.contract?.status === "SURCOINCHE"
            ? "Surcontre annoncé"
            : game.contract
              ? "Nouveau contrat"
              : "",
      );
    }
    previousGame.current = game;
  }, [game]);
  useEffect(() => {
    if (!game) return;
    const previous = previousGame.current;
    const current = currentTrick(game.publicTricks, game.completedTrickCount);
    trickTimer.current += 1;
    const token = trickTimer.current;
    if (current) {
      setDisplayedTrick(current);
      setTrickLeaving(false);
      previousTrickGame.current = game;
      return;
    }
    if (
      previous &&
      game.completedTrickCount > previous.completedTrickCount &&
      game.lastTrick
    ) {
      setDisplayedTrick(game.lastTrick);
      setTrickLeaving(true);
      const timer = window.setTimeout(
        () => token === trickTimer.current && setDisplayedTrick(null),
        1000,
      );
      previousTrickGame.current = game;
      return () => window.clearTimeout(timer);
    }
    setDisplayedTrick(null);
    setTrickLeaving(false);
    previousTrickGame.current = game;
  }, [game]);
  function command(command: unknown) {
    if (!send || !game || busy || paused || game.phase === "GAME_COMPLETED")
      return;
    setBusy(true);
    try {
      send({
        type: "GAME_COMMAND",
        commandId: crypto.randomUUID(),
        expectedVersion: version,
        command,
      });
    } catch {
      setError("Connexion indisponible, état en cours de resynchronisation.");
      setBusy(false);
    }
    window.setTimeout(() => setBusy(false), 500);
  }
  if (!game)
    return (
      <main className="game-shell">
        <p className="connection">Synchronisation de la partie…</p>
      </main>
    );
  const local = room.participants.find((p) => p.seat === game.seat);
  const owner = room.ownerId === local?.id;
  const isMyTurn = game.phase === "PLAYING" && game.activeSeat === game.seat;
  const highlightPartial = shouldHighlightHand(
    isMyTurn,
    game.hand.length,
    game.legalCards.length,
  );
  const cardLegal = (card: Card) =>
    game.legalCards.some(
      (candidate) =>
        candidate.suit === card.suit && candidate.rank === card.rank,
    );
  const orderedHand = useMemo(
    () => sortHand(game.hand, game.contract?.bid.trumpSuit) as Card[],
    [game.hand, game.contract?.bid.trumpSuit],
  );
  const trickFlyDirection =
    trickLeaving &&
    displayedTrick?.winner !== null &&
    displayedTrick?.winner !== undefined
      ? relativePosition(game.seat, displayedTrick.winner)
      : null;
  return (
    <main className="game-shell">
      {paused && (
        <div className="suspended" role="status">
          Session suspendue — reconnexion en cours. Les commandes sont
          désactivées.
        </div>
      )}
      <header className="game-header">
        <button className="home-button" onClick={onLeave}>
          Accueil
        </button>
        <div className="score">
          <b>Nous : {game.seat % 2 === 0 ? game.scores.A : game.scores.B}</b>
          <b>Eux : {game.seat % 2 === 0 ? game.scores.B : game.scores.A}</b>
        </div>
      </header>
      <section className="game-table">
        {room.participants
          .filter((p) => p.seat !== game.seat)
          .map((p) => (
            <div
              className={`player player-${relativePosition(game.seat, p.seat)} ${displayedTrick?.winner === p.seat ? "player-winner" : ""}`}
              key={p.id}
            >
              <strong>{p.nickname}</strong>
              {game.contract?.bid.bidderSeat === p.seat && (
                <small className="player-contract">
                  {game.contract.bid.value}{" "}
                  {suitSymbol(game.contract.bid.trumpSuit)}{" "}
                  {game.contract.status !== "NORMAL"
                    ? game.contract.status
                    : ""}
                </small>
              )}
            </div>
          ))}
        <div className="trick" data-testid="current-trick">
          {displayedTrick?.cards.map((entry) => (
            <span
              className={`trick-card trick-${relativePosition(game.seat, entry.seat)}${trickFlyDirection ? ` trick-fly-${trickFlyDirection}` : ""}`}
            >
              <PlayingCard
                key={`${entry.seat}-${entry.card.rank}`}
                card={entry.card}
                animated
              />
            </span>
          ))}
        </div>
        {game.phase === "PLAYING" && game.activeSeat !== null && !paused && (
          <p className="turn-message">
            {game.activeSeat === game.seat
              ? turnMessage(game.activeSeat, game.seat, local?.nickname)
              : turnMessage(
                  game.activeSeat,
                  game.seat,
                  room.participants.find(
                    (player) => player.seat === game.activeSeat,
                  )?.nickname,
                )}
          </p>
        )}
      </section>
      <p className="sr-feedback" aria-live="polite">
        {feedback}
      </p>
      {game.lastTrick && (
        <LastTrickDialog
          trick={game.lastTrick}
          room={room}
          localSeat={game.seat}
        />
      )}
      {game.biddingActions.includes("PLACE_BID") && (
        <section className="panel">
          <h2>Enchères</h2>
          <select
            value={bidValue}
            onChange={(e) =>
              setBidValue(
                e.target.value === "CAPOT"
                  ? "CAPOT"
                  : (Number(e.target.value) as number),
              )
            }
          >
            {game.bidValues.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={trump}
            onChange={(e) => setTrump(e.target.value as Card["suit"])}
          >
            {game.trumpSuits.map((suit) => (
              <option key={suit} value={suit}>
                {SUIT_LABELS[suit]}
              </option>
            ))}
          </select>
          <button
            disabled={busy || paused}
            onClick={() =>
              command({
                type: "PLACE_BID",
                seat: game.seat,
                value: bidValue,
                trumpSuit: trump,
              })
            }
          >
            {AUCTION_LABELS.BID}
          </button>
          <button
            disabled={busy || paused}
            className="secondary"
            onClick={() => command({ type: "PASS", seat: game.seat })}
          >
            {AUCTION_LABELS.PASS}
          </button>
        </section>
      )}
      {game.biddingActions.includes("COINCHE") && (
        <button
          disabled={busy || paused}
          onClick={() => command({ type: "COINCHE", seat: game.seat })}
        >
          {AUCTION_LABELS.COINCHE}
        </button>
      )}
      {game.biddingActions.includes("SURCOINCHE") && (
        <button
          disabled={busy || paused}
          onClick={() => command({ type: "SURCOINCHE", seat: game.seat })}
        >
          {AUCTION_LABELS.SURCOINCHE}
        </button>
      )}
      {game.biddingActions.includes("DECLINE_SURCOINCHE") && (
        <button
          disabled={busy}
          className="secondary"
          onClick={() =>
            command({ type: "DECLINE_SURCOINCHE", seat: game.seat })
          }
        >
          {AUCTION_LABELS.PASS}
        </button>
      )}
      {game.hand.length > 0 && (
        <section className="hand" data-testid="local-hand">
          <h2 data-testid="local-identity">
            {local?.nickname ?? "Votre main"}
            {game.contract?.bid.bidderSeat === game.seat && (
              <small className="player-contract">
                {game.contract.bid.value}{" "}
                {suitSymbol(game.contract.bid.trumpSuit)}{" "}
                {game.contract.status !== "NORMAL" ? game.contract.status : ""}
              </small>
            )}
          </h2>
          {orderedHand.map((card, index) => (
            <button
              data-testid="card"
              style={{ "--card-index": index } as React.CSSProperties}
              className={`card-button ${dealAnimation > 0 ? "deal-card" : ""} ${highlightPartial && cardLegal(card) ? "card-highlight" : ""} ${isMyTurn && cardLegal(card) ? "card-playable" : ""}`}
              aria-label={`${cardLabel(card)}${cardLegal(card) ? ", jouable" : ", non jouable"}`}
              disabled={!cardLegal(card) || busy || paused}
              key={`${card.suit}-${card.rank}`}
              onClick={() =>
                command({ type: "PLAY_CARD", seat: game.seat, card })
              }
            >
              <PlayingCard card={card} />
            </button>
          ))}
        </section>
      )}
      <p data-testid="completed-tricks" className="sr-feedback">
        Plis terminés : {game.completedTrickCount}
      </p>
      {game.dealResult && (
        <section className="panel">
          <h2>Fin de donne</h2>
          <p>
            {game.dealResult.contractMade ? "Contrat réussi" : "Contrat chuté"}{" "}
            · A {game.dealResult.assignedScore.A} — B{" "}
            {game.dealResult.assignedScore.B} · Scores cumulés : A{" "}
            {game.scores.A} — B {game.scores.B}
          </p>
          {game.phase === "DEAL_COMPLETED" && owner && (
            <button onClick={() => send?.({ type: "START_DEAL" })}>
              Lancer la donne suivante
            </button>
          )}
        </section>
      )}
      {game.phase === "GAME_COMPLETED" && (
        <section className="panel" data-testid="game-result">
          <h2>Partie terminée</h2>
          <p>
            {game.scores.A === game.scores.B
              ? "Égalité finale"
              : `Équipe ${game.scores.A > game.scores.B ? "A" : "B"} gagnante`}{" "}
            · A {game.scores.A} — B {game.scores.B}
          </p>
        </section>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}
function suitSymbol(suit: Card["suit"]) {
  return { SPADES: "♠", HEARTS: "♥", DIAMONDS: "♦", CLUBS: "♣" }[suit];
}
function LastTrickDialog({
  trick,
  room,
  localSeat,
}: {
  trick: NonNullable<GameView["lastTrick"]>;
  room: Room;
  localSeat: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button className="secondary" onClick={() => setOpen(true)}>
        Dernier pli
      </button>
      {open && (
        <div
          className="dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Dernier pli"
        >
          <section className="dialog">
            <h2>Dernier pli</h2>
            <div className="trick last-trick-layout">
              {trick.cards.map((entry) => (
                <span
                  key={entry.seat}
                  className={`trick-card trick-${relativePosition(localSeat, entry.seat)}`}
                >
                  <PlayingCard card={entry.card} />
                </span>
              ))}
            </div>
            <p>
              Gagnant :{" "}
              {room.participants.find((player) => player.seat === trick.winner)
                ?.nickname ?? "—"}
            </p>
            <button onClick={() => setOpen(false)}>Fermer</button>
          </section>
        </div>
      )}
    </>
  );
}
function PlayingCard({
  card,
  animated = false,
}: {
  card: Card;
  animated?: boolean;
}) {
  const illustrationId = cardIllustrationId(card);
  return (
    <svg
      role="img"
      aria-label={cardLabel(card)}
      data-card-suit={card.suit}
      data-card-rank={card.rank}
      className={`playing-card ${animated ? "card-arrival" : ""}`}
      viewBox="0 0 169.075 244.64"
    >
      <use href={`/assets/svg-cards.svg#${illustrationId}`} />
    </svg>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
