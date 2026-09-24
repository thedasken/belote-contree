import { describe, expect, it } from "vitest";
import { validNickname, validRoomCode } from "./validation";
describe("validation lobby", () => {
  it("accepts valid nicknames only", () => {
    expect(validNickname(" Alice ")).toBe(true);
    expect(validNickname("")).toBe(false);
    expect(validNickname("x".repeat(33))).toBe(false);
  });
  it("accepts eight-character room codes", () => {
    expect(validRoomCode("ABCD2345")).toBe(true);
    expect(validRoomCode("bad-code")).toBe(false);
    expect(validRoomCode("ABCDEFGI")).toBe(false);
  });
});
