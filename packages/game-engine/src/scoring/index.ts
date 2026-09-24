import { teamOfSeat } from "../core/index.js";
import type { Card, SeatId, Team } from "../core/index.js";
import type { Contract } from "../bidding/index.js";
import type { Trick, PlayedCard } from "../tricks/index.js";

export interface TeamScore {
  readonly A: number;
  readonly B: number;
}
export interface BeloteBonus {
  readonly team: Team;
  readonly seat: SeatId;
  readonly points: 0 | 20;
  readonly declared: boolean;
}
export interface ScoringInput {
  readonly contract: Contract;
  readonly tricks: readonly Trick[];
  readonly rawPoints: Readonly<Record<Team, number>>;
  readonly tricksWon: Readonly<Record<Team, number>>;
  readonly initialHands: readonly [
    readonly Card[],
    readonly Card[],
    readonly Card[],
    readonly Card[],
  ];
  readonly playedCards?: readonly PlayedCard[];
}
export interface DealResult {
  readonly rawTrickPoints: TeamScore;
  readonly beloteBonus: TeamScore;
  readonly contractPoints: TeamScore;
  readonly assignedScore: TeamScore;
  readonly contractMade: boolean;
  readonly capot: boolean;
  readonly applied: boolean;
}

export class InvalidScoringInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScoringInputError";
  }
}
const teams: readonly Team[] = ["A", "B"];
const add = (a: number, b: number): number => a + b;
const round10 = (value: number): number => Math.floor((value + 5) / 10) * 10;
function validate(input: ScoringInput): void {
  if (
    input.tricks.length !== 8 ||
    input.tricks.some((trick) => trick.cards.length !== 4)
  )
    throw new InvalidScoringInputError(
      "Exactly eight complete tricks are required",
    );
  if (
    input.rawPoints.A < 0 ||
    input.rawPoints.B < 0 ||
    input.rawPoints.A + input.rawPoints.B !== 162
  )
    throw new InvalidScoringInputError("Raw trick points must total 162");
  if (
    input.tricksWon.A < 0 ||
    input.tricksWon.B < 0 ||
    input.tricksWon.A + input.tricksWon.B !== 8
  )
    throw new InvalidScoringInputError("Trick counts must total eight");
  if (
    input.initialHands.length !== 4 ||
    input.initialHands.some((hand) => hand.length !== 8)
  )
    throw new InvalidScoringInputError(
      "Initial hands must contain four hands of eight cards",
    );
}
function belote(input: ScoringInput): TeamScore {
  const played =
    input.playedCards ?? input.tricks.flatMap((trick) => trick.cards);
  const result: { A: number; B: number } = { A: 0, B: 0 };
  const trump = input.contract.bid.trumpSuit;
  for (const seat of [0, 1, 2, 3] as const) {
    const hand = input.initialHands[seat]!;
    const hasPair =
      hand.some((card) => card.suit === trump && card.rank === "K") &&
      hand.some((card) => card.suit === trump && card.rank === "Q");
    const playedPair =
      hasPair &&
      played.some(
        (entry) =>
          entry.seat === seat &&
          entry.card.suit === trump &&
          entry.card.rank === "K",
      ) &&
      played.some(
        (entry) =>
          entry.seat === seat &&
          entry.card.suit === trump &&
          entry.card.rank === "Q",
      );
    if (playedPair) result[teamOfSeat(seat)] += 20;
  }
  return result;
}
export function calculateDealScore(input: ScoringInput): DealResult {
  validate(input);
  const bonus = belote(input);
  const raw = { A: input.rawPoints.A, B: input.rawPoints.B };
  const preneurs = input.contract.team;
  const defense: Team = preneurs === "A" ? "B" : "A";
  const capot = input.tricksWon[preneurs] === 8;
  const capotPoints = capot ? 100 : 10;
  const adjustedPreneurPoints =
    raw[preneurs] + bonus[preneurs] + (capot ? capotPoints - 10 : 0);
  const numeric = input.contract.bid.value !== "CAPOT";
  let contractMade = capot;
  if (numeric)
    contractMade = raw[preneurs] + bonus[preneurs] >= input.contract.bid.value;
  const assigned: { A: number; B: number } = { A: 0, B: 0 };
  if (
    input.contract.status === "CONTRE" ||
    input.contract.status === "SURCONTRE"
  ) {
    const multiplier = input.contract.status === "CONTRE" ? 2 : 4;
    const forfait =
      (160 + (numeric ? input.contract.bid.value : 0)) * multiplier;
    assigned[contractMade ? preneurs : defense] = forfait;
    assigned.A += bonus.A;
    assigned.B += bonus.B;
  } else if (input.contract.bid.value === "CAPOT") {
    assigned[capot ? preneurs : defense] = 500;
    assigned.A += bonus.A;
    assigned.B += bonus.B;
  } else if (contractMade && capot) {
    assigned[preneurs] = 250 + input.contract.bid.value;
    assigned.A += bonus.A;
    assigned.B += bonus.B;
  } else if (contractMade) {
    assigned[preneurs] = round10(
      adjustedPreneurPoints + input.contract.bid.value,
    );
    assigned[defense] = round10(raw[defense] + bonus[defense]);
  } else {
    assigned[preneurs] = bonus[preneurs];
    assigned[defense] = 160 + input.contract.bid.value + bonus[defense];
  }
  const contractPoints: TeamScore = {
    A: assigned.A - bonus.A,
    B: assigned.B - bonus.B,
  };
  return {
    rawTrickPoints: raw,
    beloteBonus: bonus,
    contractPoints,
    assignedScore: assigned,
    contractMade,
    capot,
    applied: false,
  };
}
export function applyDealResult(
  current: DealResult | null,
  result: DealResult,
): DealResult {
  if (current?.applied)
    throw new InvalidScoringInputError("Deal result was already applied");
  if (result.applied)
    throw new InvalidScoringInputError("Deal result was already applied");
  return { ...result, applied: true };
}
