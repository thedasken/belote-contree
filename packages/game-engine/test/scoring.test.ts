import { describe, expect, it } from "vitest";
import {
  calculateDealScore,
  InvalidScoringInputError,
  applyDealResult,
  type ScoringInput,
} from "../src/index.js";
import {
  createDeck,
  dealCards,
  type Card,
  type Contract,
} from "../src/index.js";

const card = (rank: Card["rank"] = "7"): Card => ({ suit: "SPADES", rank });
const hands = dealCards(createDeck(), 0);
const tricks = Array.from({ length: 8 }, (_, index) => ({
  index,
  leader: 0 as const,
  cards: [
    { seat: 0 as const, card: card() },
    { seat: 1 as const, card: card("8") },
    { seat: 2 as const, card: card("9") },
    { seat: 3 as const, card: card("10") },
  ],
  winner: (index % 2 ? 1 : 0) as 0 | 1,
  points: 0,
}));
function input(
  value: Contract["bid"]["value"],
  status: Contract["status"] = "NORMAL",
  rawPoints = { A: 110, B: 52 },
  wins = { A: 4, B: 4 },
): ScoringInput {
  return {
    contract: {
      bid: { bidderSeat: 0, value, trumpSuit: "HEARTS" },
      team: "A",
      status,
    },
    tricks,
    rawPoints,
    tricksWon: wins,
    initialHands: hands,
  };
}
describe("SCR-01 à SCR-18 — scoring", () => {
  it("scores a successful numeric contract with rounding", () => {
    const result = calculateDealScore(input(80));
    expect(result.contractMade).toBe(true);
    expect(result.assignedScore).toEqual({ A: 190, B: 50 });
  });
  it("checks the contract before rounding and scores a failed contract", () => {
    expect(
      calculateDealScore(input(90, "NORMAL", { A: 89, B: 73 })).assignedScore,
    ).toEqual({ A: 0, B: 250 });
    expect(
      calculateDealScore(input(100, "NORMAL", { A: 115, B: 47 })).assignedScore,
    ).toEqual({ A: 220, B: 50 });
  });
  it("scores countered and surcountered contracts by forfait", () => {
    expect(calculateDealScore(input(100, "CONTRE")).assignedScore).toEqual({
      A: 520,
      B: 0,
    });
    expect(calculateDealScore(input(100, "SURCONTRE")).assignedScore).toEqual({
      A: 1040,
      B: 0,
    });
  });
  it("keeps the defender's score and belote separate on a failed contract", () => {
    expect(
      calculateDealScore(input(100, "NORMAL", { A: 90, B: 72 })).assignedScore
        .B,
    ).toBe(260);
  });
  it("handles requested and unrequested capot", () => {
    expect(
      calculateDealScore(input(160, "NORMAL", { A: 162, B: 0 }, { A: 8, B: 0 }))
        .assignedScore,
    ).toEqual({ A: 410, B: 0 });
    expect(
      calculateDealScore(
        input("CAPOT", "NORMAL", { A: 162, B: 0 }, { A: 8, B: 0 }),
      ).assignedScore,
    ).toEqual({ A: 500, B: 0 });
  });
  it("adds the ten of der only through the capot adjustment", () => {
    const result = calculateDealScore(
      input("CAPOT", "NORMAL", { A: 162, B: 0 }, { A: 8, B: 0 }),
    );
    expect(result.rawTrickPoints).toEqual({ A: 162, B: 0 });
    expect(result.capot).toBe(true);
  });
  it("rejects incomplete or incoherent results", () => {
    expect(() =>
      calculateDealScore({ ...input(80), tricks: tricks.slice(0, 7) }),
    ).toThrow(InvalidScoringInputError);
    expect(() =>
      calculateDealScore({ ...input(80), rawPoints: { A: 100, B: 0 } }),
    ).toThrow(InvalidScoringInputError);
    expect(() =>
      calculateDealScore({ ...input(80), tricksWon: { A: 9, B: 0 } }),
    ).toThrow(InvalidScoringInputError);
  });
  it("applies a deal result exactly once", () => {
    const result = calculateDealScore(input(80));
    const applied = applyDealResult(null, result);
    expect(applied.applied).toBe(true);
    expect(() => applyDealResult(applied, applied)).toThrow(
      InvalidScoringInputError,
    );
  });
  it("detects a belote from the initial hand and played cards", () => {
    const initial = hands.map((hand) => [...hand]) as typeof hands;
    const king: Card = { suit: "HEARTS", rank: "K" };
    const queen: Card = { suit: "HEARTS", rank: "Q" };
    initial[0] = [king, queen, ...hands[0]!.slice(2)] as readonly Card[];
    const result = calculateDealScore({
      ...input(80),
      initialHands: initial,
      playedCards: [
        { seat: 0, card: king },
        { seat: 0, card: queen },
      ],
    });
    expect(result.beloteBonus.A).toBe(20);
    expect(result.assignedScore.A).toBe(210);
  });
});
