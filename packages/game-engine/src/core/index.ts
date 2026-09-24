export const SEATS = [0, 1, 2, 3] as const;
export type SeatId = (typeof SEATS)[number];
export type Team = "A" | "B";
export type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";
export type Rank = "7" | "8" | "9" | "J" | "Q" | "K" | "10" | "A";
export const SUITS = [
  "SPADES",
  "HEARTS",
  "DIAMONDS",
  "CLUBS",
] as const satisfies readonly Suit[];
export const RANKS = [
  "7",
  "8",
  "9",
  "J",
  "Q",
  "K",
  "10",
  "A",
] as const satisfies readonly Rank[];
export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}
export class InvalidSeatError extends Error {
  constructor(seat: number) {
    super(`Invalid seat: ${seat}`);
    this.name = "InvalidSeatError";
  }
}
export class InvalidDeckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDeckError";
  }
}
export function assertSeatId(seat: number): asserts seat is SeatId {
  if (!SEATS.includes(seat as SeatId)) throw new InvalidSeatError(seat);
}
export function nextSeat(seat: SeatId): SeatId {
  return ((seat + 1) % 4) as SeatId;
}
export function teamOfSeat(seat: SeatId): Team {
  return seat % 2 === 0 ? "A" : "B";
}
