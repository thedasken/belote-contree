import { InvalidDeckError, RANKS, SUITS, assertSeatId } from "../core/index.js";
import type { Card, SeatId, Suit, Rank } from "../core/index.js";
export const createDeck = (): readonly Card[] =>
  SUITS.flatMap((suit) => RANKS.map((rank) => Object.freeze({ suit, rank })));
function isCard(value: Card): boolean {
  return (
    !!value &&
    SUITS.includes(value.suit as Suit) &&
    RANKS.includes(value.rank as Rank)
  );
}
function key(card: Card): string {
  return `${card.suit}:${card.rank}`;
}
export function validateDeck(deck: readonly Card[]): void {
  if (deck.length !== 32)
    throw new InvalidDeckError(
      `A deck must contain 32 cards, got ${deck.length}`,
    );
  const seen = new Set<string>();
  for (const card of deck) {
    if (!isCard(card))
      throw new InvalidDeckError("Deck contains an invalid card");
    const id = key(card);
    if (seen.has(id)) throw new InvalidDeckError(`Duplicate card: ${id}`);
    seen.add(id);
  }
}
export interface RandomSource {
  next(): number;
}
export function shuffleDeck(
  deck: readonly Card[],
  random: RandomSource,
): readonly Card[] {
  validateDeck(deck);
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const value = random.next();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new RangeError("Random source must return a number in [0, 1)");
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return Object.freeze(result);
}
export type Hands = readonly [
  readonly Card[],
  readonly Card[],
  readonly Card[],
  readonly Card[],
];
export function dealCards(
  shuffledDeck: readonly Card[],
  dealerSeat: SeatId,
): Hands {
  validateDeck(shuffledDeck);
  assertSeatId(dealerSeat);
  const hands: Card[][] = [[], [], [], []];
  for (let index = 0; index < shuffledDeck.length; index++) {
    const seat = ((dealerSeat + 1 + index) % 4) as SeatId;
    hands[seat]!.push(shuffledDeck[index]!);
  }
  return Object.freeze(
    hands.map((hand) => Object.freeze(hand)) as unknown as Hands,
  );
}
const TRUMP_ORDER: readonly Rank[] = ["7", "8", "Q", "K", "10", "A", "9", "J"];
const PLAIN_ORDER: readonly Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];
export function cardForce(card: Card, trump: Suit): number {
  return (card.suit === trump ? TRUMP_ORDER : PLAIN_ORDER).indexOf(card.rank);
}
export function cardPoints(card: Card, trump: Suit): number {
  if (card.suit === trump)
    return (
      { J: 20, "9": 14, A: 11, "10": 10, K: 4, Q: 3, "8": 0, "7": 0 } as const
    )[card.rank];
  return (
    { A: 11, "10": 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 } as const
  )[card.rank];
}
