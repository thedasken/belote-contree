import { describe, expect, it } from "vitest";
import {
  createBiddingState,
  executeBiddingCommand,
  getBiddingActions,
  InvalidBiddingCommandError,
  type BiddingCommand,
  type BiddingState,
} from "../src/index.js";

const bid = (
  seat: 0 | 1 | 2 | 3,
  value: 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160 | "CAPOT",
  trumpSuit: "HEARTS" | "SPADES" = "HEARTS",
): BiddingCommand => ({ type: "PLACE_BID", seat, value, trumpSuit });
const pass = (seat: 0 | 1 | 2 | 3): BiddingCommand => ({ type: "PASS", seat });
const coinche = (seat: 0 | 1 | 2 | 3): BiddingCommand => ({
  type: "COINCHE",
  seat,
});
const decide = (
  type: "SURCOINCHE" | "DECLINE_SURCOINCHE",
  seat: 0 | 1 | 2 | 3,
): BiddingCommand => ({ type, seat });
function play(
  state: BiddingState,
  ...commands: BiddingCommand[]
): BiddingState {
  return commands.reduce(
    (current, command) => executeBiddingCommand(current, command).state,
    state,
  );
}

describe("BID-01 à BID-09 — enchères ordinaires", () => {
  it("accepts 80 in opening position and tracks the contract team", () => {
    const result = executeBiddingCommand(createBiddingState(3), bid(0, 80));
    expect(result.state.activeSeat).toBe(1);
    expect(result.state.lastBidValue).toBe(80);
    expect(result.state.bids[0]?.trumpSuit).toBe("HEARTS");
  });
  it("rejects invalid values and non-increasing bids", () => {
    const state = play(createBiddingState(3), bid(0, 80));
    expect(() =>
      executeBiddingCommand(createBiddingState(3), bid(0, 85 as never)),
    ).toThrow(InvalidBiddingCommandError);
    expect(() => executeBiddingCommand(state, bid(1, 80))).toThrow(
      InvalidBiddingCommandError,
    );
    expect(() => executeBiddingCommand(state, bid(1, 70 as never))).toThrow(
      InvalidBiddingCommandError,
    );
  });
  it("accepts 100 after 90 and capot after 160, but nothing after capot", () => {
    let state = play(createBiddingState(3), bid(0, 90), bid(1, 100));
    state = play(state, bid(2, 160), bid(3, "CAPOT"));
    expect(state.lastBidValue).toBe("CAPOT");
    expect(() => executeBiddingCommand(state, bid(0, 160))).toThrow(
      InvalidBiddingCommandError,
    );
  });
  it("requires the active seat for ordinary commands and cancels four initial passes", () => {
    const initial = createBiddingState(3);
    expect(() => executeBiddingCommand(initial, bid(1, 80))).toThrow(
      InvalidBiddingCommandError,
    );
    const state = play(initial, pass(0), pass(1), pass(2), pass(3));
    expect(state.phase).toBe("CANCELLED");
    expect(state.contract).toBeNull();
  });
  it("completes after three passes and resets passes after a new bid", () => {
    let state = play(createBiddingState(3), bid(0, 80), pass(1), pass(2));
    expect(state.consecutivePasses).toBe(2);
    state = play(state, bid(3, 90), pass(0), pass(1), pass(2));
    expect(state.phase).toBe("COMPLETED");
    expect(state.contract?.team).toBe("B");
  });
  it("rejects every command after completion", () => {
    const state = play(
      createBiddingState(3),
      bid(0, 80),
      pass(1),
      pass(2),
      pass(3),
    );
    expect(() => executeBiddingCommand(state, pass(0))).toThrow(
      InvalidBiddingCommandError,
    );
  });
});

describe("BID-10 à BID-17 — contre et surcontre", () => {
  it("allows a defense coinche out of turn and opens the surcoinche window", () => {
    const state = play(createBiddingState(3), bid(0, 80));
    const result = executeBiddingCommand(state, coinche(1));
    expect(result.state.phase).toBe("SURCOINCHE_WINDOW");
    expect(result.state.contract?.status).toBe("CONTRE");
    expect(getBiddingActions(result.state, 0)).toEqual([
      "SURCOINCHE",
      "DECLINE_SURCOINCHE",
    ]);
  });
  it("rejects coinche by preneurs, without contract, or a second coinche", () => {
    expect(() =>
      executeBiddingCommand(createBiddingState(3), coinche(1)),
    ).toThrow(InvalidBiddingCommandError);
    const state = play(createBiddingState(3), bid(0, 80));
    expect(() => executeBiddingCommand(state, coinche(0))).toThrow(
      InvalidBiddingCommandError,
    );
    const window = executeBiddingCommand(state, coinche(1)).state;
    expect(() => executeBiddingCommand(window, coinche(3))).toThrow(
      InvalidBiddingCommandError,
    );
  });
  it("lets either preneur surcoinche once and closes immediately", () => {
    const state = play(createBiddingState(3), bid(0, 80));
    const result = executeBiddingCommand(
      executeBiddingCommand(state, coinche(1)).state,
      decide("SURCOINCHE", 2),
    );
    expect(result.state.phase).toBe("COMPLETED");
    expect(result.state.contract?.status).toBe("SURCONTRE");
  });
  it("closes after both distinct preneurs decline", () => {
    const window = executeBiddingCommand(
      play(createBiddingState(3), bid(0, 80)),
      coinche(1),
    ).state;
    const state = play(
      window,
      decide("DECLINE_SURCOINCHE", 0),
      decide("DECLINE_SURCOINCHE", 2),
    );
    expect(state.phase).toBe("COMPLETED");
    expect(state.contract?.status).toBe("CONTRE");
    expect(() =>
      executeBiddingCommand(state, decide("DECLINE_SURCOINCHE", 0)),
    ).toThrow(InvalidBiddingCommandError);
  });
  it("rejects defense decisions, bids, and third decisions in the window", () => {
    const window = executeBiddingCommand(
      play(createBiddingState(3), bid(0, 80)),
      coinche(1),
    ).state;
    expect(() =>
      executeBiddingCommand(window, decide("SURCOINCHE", 1)),
    ).toThrow(InvalidBiddingCommandError);
    expect(() => executeBiddingCommand(window, bid(2, 90))).toThrow(
      InvalidBiddingCommandError,
    );
    const afterOne = executeBiddingCommand(
      window,
      decide("DECLINE_SURCOINCHE", 0),
    ).state;
    expect(() =>
      executeBiddingCommand(afterOne, decide("DECLINE_SURCOINCHE", 0)),
    ).toThrow(InvalidBiddingCommandError);
  });
  it("rejects a second command applied to a closed snapshot", () => {
    const window = executeBiddingCommand(
      play(createBiddingState(3), bid(0, 80)),
      coinche(1),
    ).state;
    const closed = executeBiddingCommand(window, decide("SURCOINCHE", 0));
    expect(() =>
      executeBiddingCommand(closed.state, decide("SURCOINCHE", 2)),
    ).toThrow(InvalidBiddingCommandError);
  });
  it("does not mutate the input state", () => {
    const state = play(createBiddingState(3), bid(0, 80));
    const snapshot = structuredClone(state);
    executeBiddingCommand(state, coinche(1));
    expect(state).toEqual(snapshot);
  });
});
