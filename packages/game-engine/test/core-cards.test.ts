import { describe, expect, it } from "vitest";
import {
  cardForce,
  cardPoints,
  createDeck,
  dealCards,
  InvalidDeckError,
  InvalidSeatError,
  nextSeat,
  RANKS,
  SEATS,
  shuffleDeck,
  SUITS,
  teamOfSeat,
  validateDeck,
  type Card,
} from "../src/index.js";
describe("CORE-01/02", () => {
  it("maps seats to partners and cycles", () => {
    expect(SEATS.map(nextSeat)).toEqual([1, 2, 3, 0]);
    expect(SEATS.map(teamOfSeat)).toEqual(["A", "B", "A", "B"]);
  });
  it("exposes four suits and eight ranks", () => {
    expect(SUITS).toHaveLength(4);
    expect(RANKS).toHaveLength(8);
  });
  it("rejects invalid dealer seats", () =>
    expect(() => dealCards(createDeck(), 4 as never)).toThrow(
      InvalidSeatError,
    ));
});
describe("CAR-01 to CAR-05", () => {
  it("creates 32 unique cards and rejects malformed decks", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map((c) => c.suit + ":" + c.rank)).size).toBe(32);
    expect(() => validateDeck(deck.slice(0, 31))).toThrow(InvalidDeckError);
    expect(() => validateDeck([...deck.slice(0, 31), deck[0]!])).toThrow(
      InvalidDeckError,
    );
    expect(() =>
      validateDeck([{ suit: "BAD", rank: "A" } as never, ...deck.slice(1)]),
    ).toThrow(InvalidDeckError);
  });
  it("deals clockwise from the seat after the dealer, deterministically", () => {
    const deck = createDeck();
    const hands = dealCards(deck, 0);
    expect(hands.map((h) => h.length)).toEqual([8, 8, 8, 8]);
    expect(hands[1]![0]).toEqual(deck[0]);
    expect(hands[0]![0]).toEqual(deck[3]);
    expect(new Set(hands.flat().map((c) => c.suit + ":" + c.rank)).size).toBe(
      32,
    );
    expect(dealCards(deck, 3)).toEqual(dealCards(deck, 3));
  });
  it("shuffles with an injectable deterministic source", () => {
    const values = Array.from({ length: 31 }, (_, i) => (i % 3) / 3);
    const source = () => {
      let i = 0;
      return { next: () => values[i++]! };
    };
    const a = shuffleDeck(createDeck(), source());
    const b = shuffleDeck(createDeck(), source());
    expect(a).toEqual(b);
    expect(new Set(a.map((c) => c.suit + ":" + c.rank)).size).toBe(32);
    expect(() => shuffleDeck(createDeck(), { next: () => 1 })).toThrow(
      RangeError,
    );
  });
});
describe("CAR-06 to CAR-09", () => {
  const card = (rank: Card["rank"], suit: Card["suit"] = "HEARTS"): Card => ({
    rank,
    suit,
  });
  it("uses the trump point table", () =>
    expect(RANKS.map((r) => cardPoints(card(r), "HEARTS"))).toEqual([
      0, 0, 14, 20, 3, 4, 10, 11,
    ]));
  it("uses the non-trump point table", () =>
    expect(RANKS.map((r) => cardPoints(card(r), "SPADES"))).toEqual([
      0, 0, 0, 2, 3, 4, 10, 11,
    ]));
  it("keeps force distinct from points", () => {
    expect(RANKS.map((r) => cardForce(card(r), "HEARTS"))).toEqual([
      0, 1, 6, 7, 2, 3, 4, 5,
    ]);
    expect(cardForce(card("J"), "HEARTS")).toBeGreaterThan(
      cardForce(card("A"), "HEARTS"),
    );
  });
  it("totals 152 card points", () =>
    expect(
      createDeck().reduce((sum, c) => sum + cardPoints(c, "HEARTS"), 0),
    ).toBe(152));
  it("does not mutate dealt hands", () => {
    const hands = dealCards(createDeck(), 0);
    expect(Object.isFrozen(hands)).toBe(true);
    expect(Object.isFrozen(hands[0])).toBe(true);
  });
});
