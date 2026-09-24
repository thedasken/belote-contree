import {
  createDeck,
  createGame,
  execute,
  getLegalActions,
  startDeal,
  type GameState,
} from "../../../packages/game-engine/dist/index.js";

export function finishDeterministicDeal(state: GameState): GameState {
  let current = startDeal(state, createDeck()).state;
  const first = current.deal!.bidding.activeSeat;
  current = execute(current, {
    type: "PLACE_BID",
    seat: first,
    value: 80,
    trumpSuit: "SPADES",
  }).state;
  while (current.phase === "BIDDING")
    current = execute(current, {
      type: "PASS",
      seat: current.deal!.bidding.activeSeat,
    }).state;
  while (current.phase === "PLAYING") {
    const seat = current.deal!.tricks!.activeSeat;
    current = execute(current, {
      type: "PLAY_CARD",
      seat,
      card: getLegalActions(current, seat)[0]!,
    }).state;
  }
  return current;
}

export function makeVictoryFixture(): GameState {
  let state = createGame(0);
  while (Math.min(state.scores.A, state.scores.B) < 1760) {
    state = finishDeterministicDeal(state);
    if (state.phase === "GAME_COMPLETED")
      throw new Error("Fixture crossed victory threshold too early");
  }
  return state;
}
