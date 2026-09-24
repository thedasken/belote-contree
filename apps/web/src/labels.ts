import type { Card } from "./main-types";

export const SUIT_LABELS = {
  SPADES: "Pique",
  HEARTS: "Cœur",
  DIAMONDS: "Carreau",
  CLUBS: "Trèfle",
} as const;
export const SUIT_SYMBOLS = {
  SPADES: "♠",
  HEARTS: "♥",
  DIAMONDS: "♦",
  CLUBS: "♣",
} as const;
export const RANK_LABELS: Record<string, string> = {
  J: "Valet",
  Q: "Dame",
  K: "Roi",
  A: "As",
};
export const AUCTION_LABELS = {
  PASS: "Passer",
  BID: "Annoncer",
  COINCHE: "Contrer",
  SURCOINCHE: "Surcontrer",
} as const;
export function cardLabel(card: Card) {
  return `${RANK_LABELS[card.rank] ?? card.rank} de ${SUIT_LABELS[card.suit]}`;
}
export function cardIllustrationId(card: Card) {
  const suit = {
    SPADES: "spade",
    HEARTS: "heart",
    DIAMONDS: "diamond",
    CLUBS: "club",
  }[card.suit];
  const rank =
    ({ A: "1", J: "jack", Q: "queen", K: "king" } as Record<string, string>)[
      card.rank
    ] ?? card.rank;
  return `${suit}_${rank}`;
}
