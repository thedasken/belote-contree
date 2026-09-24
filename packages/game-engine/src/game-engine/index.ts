import { dealCards, shuffleDeck } from "../cards/index.js";
import type { RandomSource } from "../cards/index.js";
import {
  createBiddingState,
  executeBiddingCommand,
  getBiddingActions,
} from "../bidding/index.js";
import type {
  BiddingCommand,
  BiddingEvent,
  BiddingState,
  Contract,
} from "../bidding/index.js";
import { nextSeat, teamOfSeat } from "../core/index.js";
import type { Card, SeatId, Suit, Team } from "../core/index.js";
import { createTricksState, getLegalCards, playCard } from "../tricks/index.js";
import type {
  Trick,
  TricksEvent,
  TricksState,
  TrickHands,
} from "../tricks/index.js";
import { calculateDealScore } from "../scoring/index.js";
import type { DealResult } from "../scoring/index.js";

export type GamePhase =
  | "BIDDING"
  | "PLAYING"
  | "DEAL_COMPLETED"
  | "GAME_COMPLETED";
export interface GameDeal {
  readonly hands: TrickHands;
  readonly bidding: BiddingState;
  readonly tricks: TricksState | null;
  readonly contract: Contract | null;
  readonly result: DealResult | null;
}
export interface GameState {
  readonly phase: GamePhase;
  readonly dealerSeat: SeatId;
  readonly scores: Readonly<Record<Team, number>>;
  readonly deal: GameDeal | null;
}
export type GameCommand =
  | BiddingCommand
  | { readonly type: "PLAY_CARD"; readonly seat: SeatId; readonly card: Card };
export interface GameEvent {
  readonly type:
    | "DEAL_STARTED"
    | "BIDDING_EVENT"
    | "TRICKS_EVENT"
    | "DEAL_SCORED"
    | "GAME_COMPLETED";
  readonly event?: BiddingEvent | TricksEvent | DealResult;
}
export interface GameResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}
export interface PlayerView {
  readonly phase: GamePhase;
  readonly seat: SeatId;
  readonly dealerSeat: SeatId;
  readonly hand: readonly Card[];
  readonly legalCards: readonly Card[];
  readonly biddingActions: readonly string[];
  readonly bidValues: readonly (number | "CAPOT")[];
  readonly trumpSuits: readonly Suit[];
  readonly biddingPhase: BiddingState["phase"] | null;
  readonly scores: Readonly<Record<Team, number>>;
  readonly activeSeat: SeatId | null;
  readonly publicTricks: readonly Trick[];
  readonly completedTrickCount: number;
  readonly contract: Contract | null;
  readonly lastTrick: Trick | null;
  readonly dealResult: DealResult | null;
}
export class InvalidGameCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGameCommandError";
  }
}

export function createGame(dealerSeat: SeatId = 0): GameState {
  return { phase: "BIDDING", dealerSeat, scores: { A: 0, B: 0 }, deal: null };
}
export function startDeal(
  state: GameState,
  shuffledDeck: readonly Card[],
  random?: RandomSource,
): GameResult {
  if (state.phase === "PLAYING" || state.phase === "GAME_COMPLETED")
    throw new InvalidGameCommandError("A new deal cannot start in this phase");
  const deck = random ? shuffleDeck(shuffledDeck, random) : shuffledDeck;
  const dealer =
    state.deal && state.phase === "DEAL_COMPLETED"
      ? nextSeat(state.dealerSeat)
      : state.dealerSeat;
  const hands = dealCards(deck, dealer);
  const bidding = createBiddingState(dealer);
  return {
    state: {
      ...state,
      phase: "BIDDING",
      dealerSeat: dealer,
      deal: { hands, bidding, tricks: null, contract: null, result: null },
    },
    events: [{ type: "DEAL_STARTED" }],
  };
}
function ensureDeal(state: GameState): GameDeal {
  if (!state.deal) throw new InvalidGameCommandError("No active deal");
  return state.deal;
}
function winnerCounts(
  tricks: readonly Trick[],
): Readonly<Record<Team, number>> {
  return {
    A: tricks.filter(
      (trick) => trick.winner !== null && teamOfSeat(trick.winner) === "A",
    ).length,
    B: tricks.filter(
      (trick) => trick.winner !== null && teamOfSeat(trick.winner) === "B",
    ).length,
  };
}
export function execute(state: GameState, command: GameCommand): GameResult {
  const deal = ensureDeal(state);
  if (state.phase === "BIDDING" && command.type !== "PLAY_CARD") {
    const result = executeBiddingCommand(deal.bidding, command);
    const events = result.events.map((event) => ({
      type: "BIDDING_EVENT" as const,
      event,
    }));
    if (result.state.phase === "CANCELLED")
      return {
        state: {
          ...state,
          phase: "DEAL_COMPLETED",
          deal: { ...deal, bidding: result.state },
        },
        events,
      };
    if (result.state.phase === "COMPLETED" && result.state.contract) {
      const tricks = createTricksState(
        deal.hands,
        result.state.contract.bid.trumpSuit,
        nextSeat(state.dealerSeat),
      );
      return {
        state: {
          ...state,
          phase: "PLAYING",
          deal: {
            ...deal,
            bidding: result.state,
            contract: result.state.contract,
            tricks,
          },
        },
        events,
      };
    }
    return {
      state: { ...state, deal: { ...deal, bidding: result.state } },
      events,
    };
  }
  if (
    state.phase !== "PLAYING" ||
    command.type !== "PLAY_CARD" ||
    !deal.tricks ||
    !deal.contract
  )
    throw new InvalidGameCommandError(
      "Command is incompatible with game phase",
    );
  const result = playCard(deal.tricks, command.seat, command.card);
  const events: GameEvent[] = result.events.map((event) => ({
    type: "TRICKS_EVENT" as const,
    event,
  }));
  if (result.state.phase !== "COMPLETED")
    return {
      state: { ...state, deal: { ...deal, tricks: result.state } },
      events,
    };
  const score = calculateDealScore({
    contract: deal.contract,
    tricks: result.state.completedTricks,
    rawPoints: result.state.points,
    tricksWon: winnerCounts(result.state.completedTricks),
    initialHands: deal.hands,
  });
  const scores = {
    A: state.scores.A + score.assignedScore.A,
    B: state.scores.B + score.assignedScore.B,
  };
  const phase: GamePhase =
    scores.A >= 2000 || scores.B >= 2000 ? "GAME_COMPLETED" : "DEAL_COMPLETED";
  events.push({ type: "DEAL_SCORED", event: score });
  if (phase === "GAME_COMPLETED") events.push({ type: "GAME_COMPLETED" });
  return {
    state: {
      ...state,
      phase,
      scores,
      deal: { ...deal, tricks: result.state, result: score },
    },
    events,
  };
}
export function getLegalActions(
  state: GameState,
  seat: SeatId,
): readonly Card[] {
  if (
    state.phase !== "PLAYING" ||
    !state.deal?.tricks ||
    state.deal.tricks.activeSeat !== seat
  )
    return [];
  return getLegalCards(state.deal.tricks, seat);
}
export function getPlayerView(state: GameState, seat: SeatId): PlayerView {
  const deal = state.deal;
  const tricks = deal?.tricks;
  return {
    phase: state.phase,
    seat,
    dealerSeat: state.dealerSeat,
    hand: tricks?.hands[seat] ?? deal?.hands[seat] ?? [],
    legalCards: tricks ? getLegalCards(tricks, seat) : [],
    biddingActions: deal ? getBiddingActions(deal.bidding, seat) : [],
    bidValues:
      deal?.bidding.phase === "OPEN" && deal.bidding.activeSeat === seat
        ? (
            [80, 90, 100, 110, 120, 130, 140, 150, 160, "CAPOT"] as (
              | number
              | "CAPOT"
            )[]
          ).filter(
            (value) =>
              deal.bidding.lastBidValue === null ||
              value === "CAPOT" ||
              deal.bidding.lastBidValue === "CAPOT" ||
              (typeof value === "number" &&
                typeof deal.bidding.lastBidValue === "number" &&
                value > deal.bidding.lastBidValue),
          )
        : [],
    trumpSuits: ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"],
    biddingPhase: deal?.bidding.phase ?? null,
    scores: state.scores,
    activeSeat:
      tricks?.activeSeat ??
      (state.phase === "BIDDING" ? (deal?.bidding.activeSeat ?? null) : null),
    publicTricks: [
      ...(tricks?.completedTricks ?? []),
      ...(tricks?.currentTrick.cards.length ? [tricks.currentTrick] : []),
    ],
    contract: deal?.contract ?? null,
    completedTrickCount: tricks?.completedTricks.length ?? 0,
    lastTrick: tricks?.completedTricks.at(-1) ?? null,
    dealResult: deal?.result ?? null,
  };
}
