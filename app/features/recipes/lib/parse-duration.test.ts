import { describe, expect, it } from "vitest";

import { parseDuration } from "~/features/recipes/lib/parse-duration";

/**
 * The assertions below are taken verbatim from the worked examples in the
 * JSDoc block at the top of parse-duration.ts. That block is the spec.
 */
describe("parseDuration", () => {
  describe("documented examples", () => {
    it('parses "PT30M" as 30 minutes', () => {
      expect(parseDuration("PT30M")).toBe(30);
    });

    it('parses "PT1H30M" as 90 minutes', () => {
      expect(parseDuration("PT1H30M")).toBe(90);
    });

    it('parses "PT2H" as 120 minutes', () => {
      expect(parseDuration("PT2H")).toBe(120);
    });

    it('parses "P0DT1H0M" as 60 minutes', () => {
      expect(parseDuration("P0DT1H0M")).toBe(60);
    });

    it('parses "P1D" as 1440 minutes (24 hours)', () => {
      expect(parseDuration("P1D")).toBe(1440);
    });

    it('parses "P2DT3H15M" as 3075 minutes (2 days + 3 hours + 15 minutes)', () => {
      expect(parseDuration("P2DT3H15M")).toBe(3075);
    });

    it('parses "PT90S" as 0 minutes (seconds are ignored/floored)', () => {
      expect(parseDuration("PT90S")).toBe(0);
    });

    it("returns null for an empty string", () => {
      expect(parseDuration("")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(parseDuration(undefined)).toBeNull();
    });

    it('returns null for "invalid"', () => {
      expect(parseDuration("invalid")).toBeNull();
    });
  });

  describe("null input", () => {
    it("returns null for null", () => {
      expect(parseDuration(null)).toBeNull();
    });
  });

  describe("case insensitivity (the regex carries the `i` flag)", () => {
    it('parses lowercase "pt30m" as 30 minutes', () => {
      expect(parseDuration("pt30m")).toBe(30);
    });

    it('parses lowercase "pt1h30m" as 90 minutes', () => {
      expect(parseDuration("pt1h30m")).toBe(90);
    });

    it('parses lowercase "p1d" as 1440 minutes', () => {
      expect(parseDuration("p1d")).toBe(1440);
    });

    it('parses mixed case "P2dT3h15M" as 3075 minutes', () => {
      expect(parseDuration("P2dT3h15M")).toBe(3075);
    });
  });
});
