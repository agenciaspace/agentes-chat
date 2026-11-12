import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseImport } from "../src/lib/import";

const text = readFileSync(new URL("../../../examples/legalops/equipe-juridica.json", import.meta.url), "utf8");
const input = JSON.parse(text);
const read = () => parseImport([{ name: "equipe-juridica.json", text }]);

describe("legalops starter import compatibility", () => {
  test("preserves all four roles and complete instructions through the real parser", () => {
    const bundle = read();
    expect(bundle.agents).toHaveLength(4);
    for (const agent of input.agents) {
      const imported = bundle.agents.find((item) => item.handle === agent.handle);
      expect(imported).toBeDefined();
      expect(imported?.name).toBe(agent.name);
      expect(imported?.role).toBe(agent.role);
      expect(imported?.instructions).toBe(agent.instructions);
      expect(imported?.model).toBeNull();
    }
  });

  test("imports no shared channels, scheduled work or organization memory", () => {
    const bundle = read();
    expect(bundle.channels).toEqual([]);
    expect(bundle.routines).toEqual([]);
    expect(bundle.notes).toEqual([]);
    expect(bundle.leftOut).toEqual([]);
    expect(bundle.todo.length).toBeGreaterThan(0);
    for (const todo of bundle.todo) {
      for (const key of todo.agents) expect(bundle.agents.some((agent) => agent.key === key)).toBe(true);
    }
  });

  test("produces stable identities for repeated preview and import", () => {
    expect(read()).toEqual(read());
    expect(new Set(read().agents.map((agent) => agent.key)).size).toBe(4);
  });
});
