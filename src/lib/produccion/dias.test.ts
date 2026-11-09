import { describe, expect, it } from "vitest";
import { horaMexico } from "./dias";

describe("hora de la bitácora", () => {
  it("muestra la hora de México (UTC-6)", () => {
    expect(horaMexico("2026-11-05T16:30:00Z")).toBe("10:30");
    expect(horaMexico("2026-11-06T03:05:00Z")).toBe("21:05");
  });
});
