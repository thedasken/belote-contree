import { cardForce, cardPoints } from "../cards/index.js";
import { assertSeatId, teamOfSeat } from "../core/index.js";
import type { Card, SeatId, Suit, Team } from "../core/index.js";

export type TricksPhase = "PLAYING" | "COMPLETED";
export interface PlayedCard {
  readonly seat: SeatId;
  readonly card: Card;
}
export interface Trick {
  readonly index: number;
  readonly leader: SeatId;
  readonly cards: readonly PlayedCard[];
  readonly winner: SeatId | null;
  readonly points: number;
}
export type TrickHands = readonly [
  readonly Card[],
  readonly Card[],
  readonly Card[],
  readonly Card[],
];
export interface TricksState {
  readonly trump: Suit;
  readonly phase: TricksPhase;
  readonly activeSeat: SeatId;
  readonly hands: TrickHands;
  readonly currentTrick: Trick;
  readonly completedTricks: readonly Trick[];
  readonly points: Readonly<Record<Team, number>>;
}
export type TricksEvent =
  | { readonly type: "CardPlayed"; readonly played: PlayedCard }
  | { readonly type: "TrickCompleted"; readonly trick: Trick }
  | { readonly type: "TricksCompleted"; readonly trick: Trick };
export interface TricksResult {
  readonly state: TricksState;
  readonly events: readonly TricksEvent[];
}

export class InvalidTricksCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTricksCommandError";
  }
}

function cardId(card: Card): string {
  return card.suit + ":" + card.rank;
}
function emptyTrick(leader: SeatId, index: number): Trick {
  return { index, leader, cards: [], winner: null, points: 0 };
}
function currentWinner(trick: Trick, trump: Suit): PlayedCard | null {
  if (trick.cards.length === 0) return null;
  const leadSuit = trick.cards[0]!.card.suit;
  const candidates = trick.cards.filter(
    ({ card }) => card.suit === trump || card.suit === leadSuit,
  );
  return candidates.reduce(
    (best, played) => {
      if (!best) return played;
      if (played.card.suit === trump && best.card.suit !== trump) return played;
      if (played.card.suit !== trump && best.card.suit === trump) return best;
      return cardForce(played.card, trump) > cardForce(best.card, trump)
        ? played
        : best;
    },
    null as PlayedCard | null,
  );
}
function isSameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}
function validateHands(hands: TrickHands): void {
  const cards = hands.flat();
  if (cards.length !== 32 || hands.some((hand) => hand.length !== 8))
    throw new InvalidTricksCommandError(
      "Four hands of eight cards are required",
    );
  if (new Set(cards.map(cardId)).size !== 32)
    throw new InvalidTricksCommandError("Hands must contain 32 unique cards");
}
function handContains(hand: readonly Card[], card: Card): boolean {
  return hand.some((candidate) => isSameCard(candidate, card));
}

export function createTricksState(
  hands: TrickHands,
  trump: Suit,
  firstSeat: SeatId,
): TricksState {
  assertSeatId(firstSeat);
  validateHands(hands);
  return {
    trump,
    phase: "PLAYING",
    activeSeat: firstSeat,
    hands: hands.map((hand) =>
      Object.freeze([...hand]),
    ) as unknown as TrickHands,
    currentTrick: emptyTrick(firstSeat, 0),
    completedTricks: [],
    points: { A: 0, B: 0 },
  };
}

export function getCurrentTrick(state: TricksState): Trick {
  return state.currentTrick;
}
export function getLastCompletedTrick(state: TricksState): Trick | null {
  return state.completedTricks[state.completedTricks.length - 1] ?? null;
}
export function getTeamPoints(
  state: TricksState,
): Readonly<Record<Team, number>> {
  return state.points;
}

export function getLegalCards(
  state: TricksState,
  seat: SeatId,
): readonly Card[] {
  assertSeatId(seat);
  if (state.phase === "COMPLETED" || seat !== state.activeSeat) return [];
  const hand = state.hands[seat]!;
  const trick = state.currentTrick;
  if (trick.cards.length === 0) return hand;
  const leadSuit = trick.cards[0]!.card.suit;
  const following = hand.filter((card) => card.suit === leadSuit);
  if (following.length > 0) {
    if (leadSuit !== state.trump) return following;
    const bestTrump = Math.max(
      ...trick.cards
        .filter((played) => played.card.suit === state.trump)
        .map((played) => cardForce(played.card, state.trump)),
    );
    const higher = following.filter(
      (card) => cardForce(card, state.trump) > bestTrump,
    );
    return higher.length > 0 ? higher : following;
  }
  const winner = currentWinner(trick, state.trump)!;
  if (teamOfSeat(winner.seat) === teamOfSeat(seat)) return hand;
  const trumps = hand.filter((card) => card.suit === state.trump);
  if (trumps.length === 0) return hand;
  if (winner.card.suit !== state.trump) return trumps;
  const higher = trumps.filter(
    (card) =>
      cardForce(card, state.trump) > cardForce(winner.card, state.trump),
  );
  return higher.length > 0 ? higher : hand;
}

export function playCard(
  state: TricksState,
  seat: SeatId,
  card: Card,
): TricksResult {
  assertSeatId(seat);
  if (state.phase === "COMPLETED")
    throw new InvalidTricksCommandError("The deal is complete");
  if (seat !== state.activeSeat)
    throw new InvalidTricksCommandError("Card played out of turn");
  if (!handContains(state.hands[seat]!, card))
    throw new InvalidTricksCommandError("Card is not in the player's hand");
  const legal = getLegalCards(state, seat);
  if (!legal.some((candidate) => isSameCard(candidate, card)))
    throw new InvalidTricksCommandError("Card is not legal");
  const played: PlayedCard = { seat, card };
  const remainingHands = state.hands.map((hand, index) =>
    index === seat
      ? Object.freeze(hand.filter((candidate) => !isSameCard(candidate, card)))
      : hand,
  ) as unknown as TrickHands;
  const trick = {
    ...state.currentTrick,
    cards: [...state.currentTrick.cards, played],
  };
  const events: TricksEvent[] = [{ type: "CardPlayed", played }];
  if (trick.cards.length < 4)
    return {
      state: {
        ...state,
        hands: remainingHands,
        currentTrick: trick,
        activeSeat: ((seat + 1) % 4) as SeatId,
      },
      events,
    };
  const winner = currentWinner(trick, state.trump)!;
  const points =
    trick.cards.reduce(
      (total, entry) => total + cardPoints(entry.card, state.trump),
      0,
    ) + (state.completedTricks.length === 7 ? 10 : 0);
  const completed = { ...trick, winner: winner.seat, points };
  const team = teamOfSeat(winner.seat);
  const pointsByTeam = { ...state.points, [team]: state.points[team] + points };
  events.push({ type: "TrickCompleted", trick: completed });
  if (state.completedTricks.length === 7) {
    events.push({ type: "TricksCompleted", trick: completed });
    return {
      state: {
        ...state,
        phase: "COMPLETED",
        hands: remainingHands,
        currentTrick: completed,
        completedTricks: [...state.completedTricks, completed],
        points: pointsByTeam,
      },
      events,
    };
  }
  const next = winner.seat;
  return {
    state: {
      ...state,
      hands: remainingHands,
      activeSeat: next,
      currentTrick: emptyTrick(next, state.completedTricks.length + 1),
      completedTricks: [...state.completedTricks, completed],
      points: pointsByTeam,
    },
    events,
  };
}

export function getTricksLegalActions(
  state: TricksState,
  seat: SeatId,
): readonly Card[] {
  return getLegalCards(state, seat);
}
