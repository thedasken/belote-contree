import { describe, expect, it } from "vitest";
import { createDeck } from "../src/index.js";
import {
  createGame,
  execute,
  getLegalActions,
  getPlayerView,
  startDeal,
  type GameState,
} from "../src/index.js";

function simulateDeal(): GameState {
  let result = startDeal(createGame(3), createDeck());
  result = execute(result.state, {
    type: "PLACE_BID",
    seat: 0,
    value: 80,
    trumpSuit: "HEARTS",
  });
  result = execute(result.state, { type: "PASS", seat: 1 });
  result = execute(result.state, { type: "PASS", seat: 2 });
  result = execute(result.state, { type: "PASS", seat: 3 });
  while (result.state.phase === "PLAYING") {
    const card = getLegalActions(
      result.state,
      result.state.deal!.tricks!.activeSeat,
    )[0]!;
    result = execute(result.state, {
      type: "PLAY_CARD",
      seat: result.state.deal!.tricks!.activeSeat,
      card,
    });
  }
  return result.state;
}

describe("Game Engine — intégration", () => {
  it("runs Bidding, Tricks and Scoring with the real modules", () => {
    const state = simulateDeal();
    expect(state.phase).toBe("DEAL_COMPLETED");
    expect(state.deal?.result?.assignedScore.A).toBeGreaterThanOrEqual(0);
    expect(state.deal?.tricks?.completedTricks).toHaveLength(8);
    expect(state.scores.A + state.scores.B).toBeGreaterThan(0);
  });
  it("rotates the dealer for the next deal", () => {
    const state = simulateDeal();
    const next = startDeal(state, createDeck()).state;
    expect(next.dealerSeat).toBe(0);
    expect(next.phase).toBe("BIDDING");
  });
  it("does not expose opponents' hands in a player view", () => {
    const started = startDeal(createGame(3), createDeck()).state;
    const view = getPlayerView(started, 0);
    expect(view.hand).toEqual(started.deal?.hands[0]);
    expect(view).not.toHaveProperty("hands");
    expect(view).not.toHaveProperty("opponentHands");
  });
  it("projects legal bidding and card actions without exposing hidden hands", () => {
    const started = startDeal(createGame(3), createDeck()).state;
    const biddingView = getPlayerView(started, 0);
    expect(biddingView.biddingActions).toContain("PASS");
    expect(biddingView.bidValues).toContain(80);
    expect(biddingView.legalCards).toHaveLength(0);
    let state = execute(started, {
      type: "PLACE_BID",
      seat: 0,
      value: 80,
      trumpSuit: "HEARTS",
    }).state;
    state = execute(state, { type: "PASS", seat: 1 }).state;
    state = execute(state, { type: "PASS", seat: 2 }).state;
    state = execute(state, { type: "PASS", seat: 3 }).state;
    const playingView = getPlayerView(state, state.deal!.tricks!.activeSeat);
    expect(playingView.legalCards.length).toBeGreaterThan(0);
    expect(playingView).not.toHaveProperty("hands");
  });
});
