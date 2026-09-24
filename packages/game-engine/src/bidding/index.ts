import { assertSeatId, nextSeat, teamOfSeat } from "../core/index.js";
import type { SeatId, Suit, Team } from "../core/index.js";

export type BiddingPhase =
  | "OPEN"
  | "SURCOINCHE_WINDOW"
  | "COMPLETED"
  | "CANCELLED";
export type BidValue =
  | 80
  | 90
  | 100
  | 110
  | 120
  | 130
  | 140
  | 150
  | 160
  | "CAPOT";
export type ContractStatus = "NORMAL" | "CONTRE" | "SURCONTRE";

export interface Bid {
  readonly bidderSeat: SeatId;
  readonly value: BidValue;
  readonly trumpSuit: Suit;
}
export interface Contract {
  readonly bid: Bid;
  readonly team: Team;
  readonly status: ContractStatus;
}
export interface BiddingState {
  readonly dealerSeat: SeatId;
  readonly activeSeat: SeatId;
  readonly phase: BiddingPhase;
  readonly bids: readonly Bid[];
  readonly consecutivePasses: number;
  readonly contract: Contract | null;
  readonly lastBidder: SeatId | null;
  readonly lastBidValue: BidValue | null;
  readonly surcontreDecisions: readonly SeatId[];
}

export type BiddingCommand =
  | {
      readonly type: "PLACE_BID";
      readonly seat: SeatId;
      readonly value: BidValue;
      readonly trumpSuit: Suit;
    }
  | { readonly type: "PASS"; readonly seat: SeatId }
  | { readonly type: "COINCHE"; readonly seat: SeatId }
  | { readonly type: "SURCOINCHE"; readonly seat: SeatId }
  | { readonly type: "DECLINE_SURCOINCHE"; readonly seat: SeatId };

export type BiddingEvent =
  | { readonly type: "BID_PLACED"; readonly bid: Bid }
  | { readonly type: "PASSING"; readonly seat: SeatId }
  | { readonly type: "DEAL_CANCELLED" }
  | { readonly type: "BIDDING_COMPLETED"; readonly contract: Contract }
  | { readonly type: "COINCHE_DECLARED"; readonly seat: SeatId }
  | { readonly type: "SURCOINCHE_DECLARED"; readonly seat: SeatId }
  | { readonly type: "SURCOINCHE_DECLINED"; readonly seat: SeatId }
  | { readonly type: "SURCOINCHE_WINDOW_CLOSED"; readonly contract: Contract };

export interface BiddingResult {
  readonly state: BiddingState;
  readonly events: readonly BiddingEvent[];
}
export type BiddingAction = BiddingCommand["type"];

export class InvalidBiddingCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBiddingCommandError";
  }
}

const NUMERIC_VALUES = [80, 90, 100, 110, 120, 130, 140, 150, 160] as const;
function isNumeric(value: BidValue): value is Exclude<BidValue, "CAPOT"> {
  return value !== "CAPOT";
}
function sameTeam(a: SeatId, b: SeatId): boolean {
  return teamOfSeat(a) === teamOfSeat(b);
}
function contractFor(state: BiddingState, status: ContractStatus): Contract {
  const bid = state.bids[state.bids.length - 1];
  if (!bid) throw new InvalidBiddingCommandError("No contract exists");
  return { bid, team: teamOfSeat(bid.bidderSeat), status };
}
function nextOrdinarySeat(seat: SeatId): SeatId {
  return nextSeat(seat);
}

export function createBiddingState(dealerSeat: SeatId): BiddingState {
  assertSeatId(dealerSeat);
  return {
    dealerSeat,
    activeSeat: nextSeat(dealerSeat),
    phase: "OPEN",
    bids: [],
    consecutivePasses: 0,
    contract: null,
    lastBidder: null,
    lastBidValue: null,
    surcontreDecisions: [],
  };
}

export function validateBiddingCommand(
  state: BiddingState,
  command: BiddingCommand,
): void {
  assertSeatId(command.seat);
  if (state.phase === "COMPLETED" || state.phase === "CANCELLED")
    throw new InvalidBiddingCommandError("Bidding is closed");
  if (state.phase === "OPEN") {
    if (command.type === "COINCHE") {
      if (state.lastBidder === null)
        throw new InvalidBiddingCommandError(
          "A contract is required before a coinche",
        );
      if (sameTeam(command.seat, state.lastBidder))
        throw new InvalidBiddingCommandError("The bidding team cannot coinche");
      return;
    }
    if (command.seat !== state.activeSeat)
      throw new InvalidBiddingCommandError("Command is out of turn");
    if (command.type === "SURCOINCHE" || command.type === "DECLINE_SURCOINCHE")
      throw new InvalidBiddingCommandError("Surcoinche window is not open");
    if (command.type === "PLACE_BID") {
      if (
        !NUMERIC_VALUES.includes(command.value as never) &&
        command.value !== "CAPOT"
      )
        throw new InvalidBiddingCommandError("Invalid bid value");
      if (state.lastBidValue === "CAPOT")
        throw new InvalidBiddingCommandError("No bid is allowed after capot");
      if (
        state.lastBidValue !== null &&
        command.value !== "CAPOT" &&
        command.value <= state.lastBidValue
      )
        throw new InvalidBiddingCommandError("Bid must strictly increase");
    }
    return;
  }
  if (command.type !== "SURCOINCHE" && command.type !== "DECLINE_SURCOINCHE")
    throw new InvalidBiddingCommandError(
      "Only preneurs may decide the surcoinche",
    );
  const contract = state.contract;
  if (!contract || teamOfSeat(command.seat) !== contract.team)
    throw new InvalidBiddingCommandError(
      "Only the preneurs may decide the surcoinche",
    );
  if (state.surcontreDecisions.includes(command.seat))
    throw new InvalidBiddingCommandError("This preneur has already decided");
}

export function applyBiddingCommand(
  state: BiddingState,
  command: BiddingCommand,
): BiddingResult {
  validateBiddingCommand(state, command);
  if (state.phase === "OPEN" && command.type === "PLACE_BID") {
    const bid: Bid = {
      bidderSeat: command.seat,
      value: command.value,
      trumpSuit: command.trumpSuit,
    };
    return {
      state: {
        ...state,
        activeSeat: nextOrdinarySeat(command.seat),
        bids: [...state.bids, bid],
        consecutivePasses: 0,
        lastBidder: command.seat,
        lastBidValue: command.value,
      },
      events: [{ type: "BID_PLACED", bid }],
    };
  }
  if (state.phase === "OPEN" && command.type === "PASS") {
    const passes = state.consecutivePasses + 1;
    if (state.bids.length === 0 && passes === 4)
      return {
        state: {
          ...state,
          phase: "CANCELLED",
          activeSeat: nextOrdinarySeat(command.seat),
          consecutivePasses: passes,
        },
        events: [
          { type: "PASSING", seat: command.seat },
          { type: "DEAL_CANCELLED" },
        ],
      };
    if (state.bids.length > 0 && passes === 3) {
      const contract = contractFor(state, "NORMAL");
      return {
        state: {
          ...state,
          phase: "COMPLETED",
          activeSeat: nextOrdinarySeat(command.seat),
          consecutivePasses: passes,
          contract,
        },
        events: [
          { type: "PASSING", seat: command.seat },
          { type: "BIDDING_COMPLETED", contract },
        ],
      };
    }
    return {
      state: {
        ...state,
        activeSeat: nextOrdinarySeat(command.seat),
        consecutivePasses: passes,
      },
      events: [{ type: "PASSING", seat: command.seat }],
    };
  }
  if (state.phase === "OPEN" && command.type === "COINCHE") {
    const contract = contractFor(state, "CONTRE");
    return {
      state: {
        ...state,
        phase: "SURCOINCHE_WINDOW",
        contract,
        surcontreDecisions: [],
      },
      events: [{ type: "COINCHE_DECLARED", seat: command.seat }],
    };
  }
  const decisions = [...state.surcontreDecisions, command.seat];
  if (command.type === "SURCOINCHE") {
    const contract = contractFor(state, "SURCONTRE");
    return {
      state: {
        ...state,
        phase: "COMPLETED",
        contract,
        surcontreDecisions: decisions,
      },
      events: [
        { type: "SURCOINCHE_DECLARED", seat: command.seat },
        { type: "SURCOINCHE_WINDOW_CLOSED", contract },
      ],
    };
  }
  if (decisions.length === 2) {
    const contract = contractFor(state, "CONTRE");
    return {
      state: {
        ...state,
        phase: "COMPLETED",
        contract,
        surcontreDecisions: decisions,
      },
      events: [
        { type: "SURCOINCHE_DECLINED", seat: command.seat },
        { type: "SURCOINCHE_WINDOW_CLOSED", contract },
      ],
    };
  }
  return {
    state: { ...state, surcontreDecisions: decisions },
    events: [{ type: "SURCOINCHE_DECLINED", seat: command.seat }],
  };
}

export function executeBiddingCommand(
  state: BiddingState,
  command: BiddingCommand,
): BiddingResult {
  return applyBiddingCommand(state, command);
}
export function getBiddingActions(
  state: BiddingState,
  seat: SeatId,
): readonly BiddingAction[] {
  assertSeatId(seat);
  if (state.phase === "OPEN") {
    const actions: BiddingAction[] = [];
    if (seat === state.activeSeat) actions.push("PLACE_BID", "PASS");
    if (state.lastBidder && !sameTeam(seat, state.lastBidder))
      actions.push("COINCHE");
    return actions;
  }
  if (
    state.phase === "SURCOINCHE_WINDOW" &&
    state.contract &&
    sameTeam(seat, state.contract.bid.bidderSeat) &&
    !state.surcontreDecisions.includes(seat)
  )
    return ["SURCOINCHE", "DECLINE_SURCOINCHE"];
  return [];
}
