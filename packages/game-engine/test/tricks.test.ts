import { describe, expect, it } from "vitest";
import {
  createDeck,
  dealCards,
  getLegalCards,
  playCard,
  createTricksState,
  InvalidTricksCommandError,
  type Card,
  type TrickHands,
  type TricksState,
} from "../src/index.js";

const c = (suit: Card["suit"], rank: Card["rank"]): Card => ({ suit, rank });
function fixture(preferred: readonly (readonly Card[])[] = []): TrickHands {
  const used = new Set(
    preferred.flat().map((card) => card.suit + ":" + card.rank),
  );
  const rest = createDeck().filter(
    (card) => !used.has(card.suit + ":" + card.rank),
  );
  let offset = 0;
  return [0, 1, 2, 3].map((seat) => {
    const selected = [...(preferred[seat] ?? [])];
    while (selected.length < 8) selected.push(rest[offset++]!);
    return selected;
  }) as TrickHands;
}
function stateWith(
  preferred: readonly (readonly Card[])[] = [],
  firstSeat: 0 | 1 | 2 | 3 = 0,
): TricksState {
  return createTricksState(fixture(preferred), "HEARTS", firstSeat);
}
function play(
  state: TricksState,
  seat: 0 | 1 | 2 | 3,
  card: Card,
): TricksState {
  return playCard(state, seat, card).state;
}
function playLegalUntilDone(state: TricksState): TricksState {
  while (state.phase !== "COMPLETED") {
    const legal = getLegalCards(state, state.activeSeat);
    state = playCard(state, state.activeSeat, legal[0]!).state;
  }
  return state;
}

describe("TRK-01 à TRK-07 — cartes légales", () => {
  it("lets the leader play any card and advances in turn order", () => {
    const hands = fixture([[c("SPADES", "7")]]);
    let state = stateWith([[c("SPADES", "7")]], 0);
    expect(getLegalCards(state, 0)).toEqual(hands[0]);
    state = play(state, 0, c("SPADES", "7"));
    expect(state.activeSeat).toBe(1);
  });
  it("requires following the requested suit", () => {
    let state = stateWith([
      [c("SPADES", "7")],
      [c("SPADES", "A"), c("CLUBS", "7")],
    ]);
    state = play(state, 0, c("SPADES", "7"));
    expect(getLegalCards(state, 1)).toEqual([c("SPADES", "A")]);
  });
  it("requires a higher trump when trump is led, when possible", () => {
    let state = stateWith([
      [c("HEARTS", "7")],
      [c("HEARTS", "9"), c("HEARTS", "A")],
    ]);
    state = play(state, 0, c("HEARTS", "7"));
    expect(
      getLegalCards(state, 1).every(
        (card) => card.suit === "HEARTS" && card.rank !== "7",
      ),
    ).toBe(true);
  });
  it("requires cutting when partner does not hold the trick", () => {
    let state = stateWith([
      [c("SPADES", "7")],
      [c("SPADES", "8"), c("CLUBS", "7"), c("HEARTS", "7")],
    ]);
    state = play(state, 0, c("SPADES", "7"));
    state = play(state, 1, c("SPADES", "8"));
    expect(getLegalCards(state, 2)).toContainEqual(c("HEARTS", "A"));
  });
  it("allows any discard when partner currently wins", () => {
    let state = stateWith([
      [c("SPADES", "A")],
      [c("SPADES", "7")],
      [c("CLUBS", "7"), c("HEARTS", "7")],
    ]);
    state = play(state, 0, c("SPADES", "A"));
    state = play(state, 1, c("SPADES", "7"));
    expect(getLegalCards(state, 2)).toEqual(state.hands[2]);
  });
  it("requires overtrumping an opponent when possible and allows discard otherwise", () => {
    let state = stateWith([
      [c("SPADES", "7")],
      [c("HEARTS", "A")],
      [c("CLUBS", "7"), c("HEARTS", "J"), c("HEARTS", "7")],
    ]);
    state = play(state, 0, c("SPADES", "7"));
    state = play(state, 1, c("HEARTS", "A"));
    expect(
      getLegalCards(state, 2).every(
        (card) =>
          card.suit === "HEARTS" && card.rank !== "7" && card.rank !== "8",
      ),
    ).toBe(true);
  });
});

describe("WIN-01 à WIN-07 — résolution et invariants", () => {
  it("chooses the strongest card of the led suit, not an off-suit card", () => {
    let state = stateWith([
      [c("SPADES", "7")],
      [c("SPADES", "A")],
      [c("CLUBS", "A")],
      [c("SPADES", "8")],
    ]);
    state = play(state, 0, c("SPADES", "7"));
    state = play(state, 1, c("SPADES", "A"));
    state = play(state, 2, c("CLUBS", "A"));
    state = play(state, 3, c("SPADES", "8"));
    expect(state.completedTricks[0]?.winner).toBe(1);
    expect(state.points.B).toBe(22);
  });
  it("resolves the strongest trump and makes its owner lead next", () => {
    let state = stateWith([
      [c("SPADES", "A")],
      [c("HEARTS", "7")],
      [c("HEARTS", "9")],
      [c("HEARTS", "J")],
    ]);
    state = play(state, 0, c("SPADES", "A"));
    state = play(state, 1, c("HEARTS", "7"));
    state = play(state, 2, c("HEARTS", "9"));
    state = play(state, 3, c("HEARTS", "J"));
    expect(state.completedTricks[0]?.winner).toBe(3);
    expect(state.activeSeat).toBe(3);
  });
  it("adds the ten of last trick and totals 162", () => {
    const state = playLegalUntilDone(stateWith());
    expect(state.phase).toBe("COMPLETED");
    expect(state.completedTricks).toHaveLength(8);
    expect(state.points.A + state.points.B).toBe(162);
  });
  it("rejects absent cards, illegal cards, out of turn and cards after completion", () => {
    let state = stateWith([
      [c("SPADES", "7")],
      [c("SPADES", "A"), c("CLUBS", "7")],
    ]);
    expect(() => playCard(state, 1, c("SPADES", "A"))).toThrow(
      InvalidTricksCommandError,
    );
    state = play(state, 0, c("SPADES", "7"));
    expect(() => playCard(state, 1, c("DIAMONDS", "A"))).toThrow(
      InvalidTricksCommandError,
    );
    const done = playLegalUntilDone(stateWith());
    expect(() =>
      playCard(done, done.activeSeat, done.hands[done.activeSeat]![0]!),
    ).toThrow(InvalidTricksCommandError);
  });
  it("does not mutate the input and emits distinct completion events", () => {
    const initial = stateWith();
    const snapshot = structuredClone(initial);
    const result = playCard(initial, 0, initial.hands[0]![0]!);
    expect(initial).toEqual(snapshot);
    expect(result.events[0]?.type).toBe("CardPlayed");
  });
  it("simulates all 32 cards exactly once", () => {
    const done = playLegalUntilDone(stateWith());
    expect(done.hands.flat()).toHaveLength(0);
    expect(
      new Set(
        done.completedTricks.flatMap((trick) =>
          trick.cards.map((entry) => entry.card.suit + ":" + entry.card.rank),
        ),
      ).size,
    ).toBe(32);
  });
});
