import { describe, expect, it } from "vitest";
import { ConnectionRegistry } from "../src/connections.js";

function socket() {
  return { readyState: 1, ping() {}, terminate() {} } as never;
}
describe("ConnectionRegistry", () => {
  it("keeps one active connection and replaces the previous one", () => {
    const registry = new ConnectionRegistry();
    const first = registry.register("p1", socket());
    const second = registry.register("p1", socket());
    expect(second.replaced?.id).toBe(first.connection.id);
    expect(registry.get("p1")?.id).toBe(second.connection.id);
    expect(registry.remove(first.connection.id, "p1")).toBe(false);
    expect(registry.remove(second.connection.id, "p1")).toBe(true);
  });
  it("does not let a stale close remove the replacement", () => {
    const registry = new ConnectionRegistry();
    const first = registry.register("p1", socket());
    const second = registry.register("p1", socket());
    expect(registry.isActive(first.connection.id, "p1")).toBe(false);
    expect(registry.isActive(second.connection.id, "p1")).toBe(true);
    registry.remove(first.connection.id, "p1");
    expect(registry.get("p1")?.id).toBe(second.connection.id);
  });
});
