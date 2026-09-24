import { describe, expect, it } from "vitest";
import {
  currentTrick,
  relativePosition,
  shouldHighlightHand,
  sortHand,
  turnMessage,
  type OrderedCard,
} from "./hand-order";
import { cardIllustrationId, cardLabel } from "./labels";

const card = (
  suit: OrderedCard["suit"],
  rank: OrderedCard["rank"],
): OrderedCard => ({ suit, rank });

describe("hand ordering", () => {
  it("groups suits in fixed order and sorts without trump", () => {
    expect(
      sortHand([
        card("CLUBS", "A"),
        card("SPADES", "7"),
        card("HEARTS", "J"),
        card("SPADES", "A"),
        card("DIAMONDS", "10"),
        card("HEARTS", "A"),
      ]),
    ).toEqual([
      card("HEARTS", "A"),
      card("HEARTS", "J"),
      card("SPADES", "A"),
      card("SPADES", "7"),
      card("DIAMONDS", "10"),
      card("CLUBS", "A"),
    ]);
  });

  it("uses trump power inside the trump suit", () => {
    expect(
      sortHand(
        [
          card("HEARTS", "A"),
          card("HEARTS", "J"),
          card("HEARTS", "9"),
          card("SPADES", "A"),
        ],
        "HEARTS",
      ),
    ).toEqual([
      card("HEARTS", "J"),
      card("HEARTS", "9"),
      card("HEARTS", "A"),
      card("SPADES", "A"),
    ]);
  });

  it("does not expose a completed trick as the current trick", () => {
    const completed = [{ winner: 1 }, { winner: 2 }];
    expect(currentTrick(completed, 2)).toBeNull();
    expect(currentTrick([...completed, { winner: null }], 2)).toEqual({
      winner: null,
    });
  });

  it("places seats relative to the local player", () => {
    expect([0, 1, 2, 3].map((seat) => relativePosition(0, seat))).toEqual([
      "bottom",
      "left",
      "top",
      "right",
    ]);
  });

  it("only highlights a partial legal hand on my turn", () => {
    expect(shouldHighlightHand(true, 8, 8)).toBe(false);
    expect(shouldHighlightHand(false, 8, 3)).toBe(false);
    expect(shouldHighlightHand(true, 8, 3)).toBe(true);
  });

  it("describes the active player", () => {
    expect(turnMessage(1, 1, "Alice")).toBe("C'est à vous de jouer");
    expect(turnMessage(2, 1, "Bob")).toBe("C'est à Bob de jouer");
  });

  it("maps the 32 cards to local SVG illustrations and French labels", () => {
    const suits = ["HEARTS", "SPADES", "DIAMONDS", "CLUBS"] as const;
    const ranks = ["7", "8", "9", "J", "Q", "K", "10", "A"] as const;
    const ids = suits.flatMap((suit) =>
      ranks.map((rank) => cardIllustrationId({ suit, rank })),
    );
    expect(new Set(ids).size).toBe(32);
    expect(cardLabel({ suit: "HEARTS", rank: "J" })).toBe("Valet de Cœur");
    expect(cardLabel({ suit: "SPADES", rank: "A" })).toBe("As de Pique");
  });
});
