export type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";
export type Rank = "7" | "8" | "9" | "J" | "Q" | "K" | "10" | "A";
export type OrderedCard = { suit: Suit; rank: string };

const SUIT_ORDER: readonly Suit[] = ["HEARTS", "SPADES", "DIAMONDS", "CLUBS"];
const PLAIN_POWER: readonly Rank[] = ["A", "10", "K", "Q", "J", "9", "8", "7"];
const TRUMP_POWER: readonly Rank[] = ["J", "9", "A", "10", "K", "Q", "8", "7"];

export function sortHand(cards: readonly OrderedCard[], trump?: Suit | null) {
  const suitIndex = (suit: Suit) => SUIT_ORDER.indexOf(suit);
  const power = (card: OrderedCard) =>
    (card.suit === trump ? TRUMP_POWER : PLAIN_POWER).indexOf(
      card.rank as Rank,
    );
  return [...cards].sort(
    (a, b) => suitIndex(a.suit) - suitIndex(b.suit) || power(a) - power(b),
  );
}

export function currentTrick<T>(tricks: readonly T[], completedCount: number) {
  return tricks.length > completedCount ? tricks.at(-1)! : null;
}

export function justCompletedTrick(
  previousCount: number | null,
  completedCount: number,
) {
  return previousCount !== null && completedCount > previousCount;
}

export function relativePosition(local: number, seat: number) {
  return ["bottom", "left", "top", "right"][(seat - local + 4) % 4];
}

export function shouldHighlightHand(
  isMyTurn: boolean,
  handSize: number,
  legalSize: number,
) {
  return isMyTurn && legalSize > 0 && legalSize < handSize;
}

export function turnMessage(
  activeSeat: number,
  localSeat: number,
  nickname: string | undefined,
) {
  return activeSeat === localSeat
    ? "C'est à vous de jouer"
    : `C'est à ${nickname ?? "ce joueur"} de jouer`;
}
