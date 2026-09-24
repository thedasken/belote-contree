import { z } from "zod";

export const seatIdSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export const suitSchema = z.enum(["SPADES", "HEARTS", "DIAMONDS", "CLUBS"]);
export const cardSchema = z.object({
  suit: suitSchema,
  rank: z.enum(["7", "8", "9", "J", "Q", "K", "10", "A"]),
});
export const gameCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PLACE_BID"),
    seat: seatIdSchema,
    value: z.union([
      z.literal(80),
      z.literal(90),
      z.literal(100),
      z.literal(110),
      z.literal(120),
      z.literal(130),
      z.literal(140),
      z.literal(150),
      z.literal(160),
      z.literal("CAPOT"),
    ]),
    trumpSuit: suitSchema,
  }),
  z.object({ type: z.literal("PASS"), seat: seatIdSchema }),
  z.object({ type: z.literal("COINCHE"), seat: seatIdSchema }),
  z.object({ type: z.literal("SURCOINCHE"), seat: seatIdSchema }),
  z.object({ type: z.literal("DECLINE_SURCOINCHE"), seat: seatIdSchema }),
  z.object({
    type: z.literal("PLAY_CARD"),
    seat: seatIdSchema,
    card: cardSchema,
  }),
]);
export const authSchema = z.object({
  type: z.literal("AUTH"),
  token: z.string().min(32).max(256),
});
export const clientMessageSchema = z.discriminatedUnion("type", [
  authSchema,
  z.object({
    type: z.literal("GAME_COMMAND"),
    commandId: z.string().min(1).max(128),
    expectedVersion: z.number().int().nonnegative(),
    command: gameCommandSchema,
  }),
  z.object({ type: z.literal("START_GAME") }),
  z.object({ type: z.literal("START_DEAL") }),
  z.object({
    type: z.literal("ASSIGN_SEAT"),
    seat: seatIdSchema,
    team: z.enum(["A", "B"]),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ROOM_STATE"),
    version: z.number().int().nonnegative(),
    state: z.unknown(),
  }),
  z.object({
    type: z.literal("GAME_STATE"),
    version: z.number().int().nonnegative(),
    state: z.unknown(),
  }),
  z.object({
    type: z.literal("COMMAND_ACK"),
    commandId: z.string(),
    version: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("COMMAND_REJECTED"),
    commandId: z.string().optional(),
    code: z.string(),
    message: z.string(),
  }),
  z.object({ type: z.literal("SESSION_PAUSED") }),
  z.object({ type: z.literal("SESSION_RESUMED") }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
