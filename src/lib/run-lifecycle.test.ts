import { describe, expect, it } from "vitest";
import { RUN_GRACE_MS, countActiveFromRows, isRunActive, toActiveLifecyclePhaseOrNull } from "@/lib/run-lifecycle";

/** Frozen instant for every assertion — expected values come from the oracle table, not from isRunActive. */
const NOW_MS = Date.parse("2026-09-14T12:00:00.000Z");
const HALF_HOUR_MS = 1_800_000;
const TWO_HOURS_MS = 7_200_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** A — stamped archive wins, even with a future extend. */
const A = {
  starts_at: iso(NOW_MS + HALF_HOUR_MS),
  archived_at: iso(NOW_MS - 1_000),
  extended_until: iso(NOW_MS + TWO_HOURS_MS),
};

/** B — elapsed extend with starts_at still inside the 1-hour window. */
const B = {
  starts_at: iso(NOW_MS - HALF_HOUR_MS),
  archived_at: null,
  extended_until: iso(NOW_MS - 1_000),
};

/** C — unelapsed extend keeps a run whose starts_at is older than 1 hour. */
const C = {
  starts_at: iso(NOW_MS - TWO_HOURS_MS),
  archived_at: null,
  extended_until: iso(NOW_MS + TWO_HOURS_MS),
};

/** D — default window open (upcoming). */
const D = {
  starts_at: iso(NOW_MS + HALF_HOUR_MS),
  archived_at: null,
  extended_until: null,
};

/** E — unextended derived exit. */
const E = {
  starts_at: iso(NOW_MS - RUN_GRACE_MS - 1_000),
  archived_at: null,
  extended_until: null,
};

/** Exact extend deadline is exclusive — not audience-active. */
const EqExtend = {
  starts_at: iso(NOW_MS - HALF_HOUR_MS),
  archived_at: null,
  extended_until: iso(NOW_MS),
};

/** Exact grace instant is exclusive — not audience-active. */
const EqGrace = {
  starts_at: iso(NOW_MS - RUN_GRACE_MS),
  archived_at: null,
  extended_until: null,
};

/** F — completed but still in the default window; Complete does not free the 5-cap. */
const F = {
  starts_at: iso(NOW_MS - HALF_HOUR_MS),
  archived_at: null,
  extended_until: null,
  completed_at: iso(NOW_MS - 60_000),
};

describe("isRunActive", () => {
  it("A: stamped archive is not audience-active", () => {
    expect(isRunActive(A.starts_at, A.archived_at, A.extended_until, NOW_MS)).toBe(false);
  });

  it("B: elapsed extend with recent starts_at is not audience-active", () => {
    expect(isRunActive(B.starts_at, B.archived_at, B.extended_until, NOW_MS)).toBe(false);
  });

  it("C: unelapsed extend past the 1-hour window is audience-active", () => {
    expect(isRunActive(C.starts_at, C.archived_at, C.extended_until, NOW_MS)).toBe(true);
  });

  it("D: default window including upcoming is audience-active", () => {
    expect(isRunActive(D.starts_at, D.archived_at, D.extended_until, NOW_MS)).toBe(true);
  });

  it("E: unextended start older than 1 hour is not audience-active", () => {
    expect(isRunActive(E.starts_at, E.archived_at, E.extended_until, NOW_MS)).toBe(false);
  });

  it("Eq-extend: now === extended_until is not audience-active", () => {
    expect(isRunActive(EqExtend.starts_at, EqExtend.archived_at, EqExtend.extended_until, NOW_MS)).toBe(false);
  });

  it("Eq-grace: now === starts_at + RUN_GRACE_MS is not audience-active", () => {
    expect(isRunActive(EqGrace.starts_at, EqGrace.archived_at, EqGrace.extended_until, NOW_MS)).toBe(false);
  });
});

describe("countActiveFromRows", () => {
  it("B with recent starts_at contributes 0 to the 5-cap", () => {
    expect(countActiveFromRows([B], NOW_MS)).toBe(0);
  });

  it("C contributes 1 to the 5-cap", () => {
    expect(countActiveFromRows([C], NOW_MS)).toBe(1);
  });

  it("mix of elapsed and unelapsed counts only the unelapsed", () => {
    expect(countActiveFromRows([B, C, E], NOW_MS)).toBe(1);
  });

  it("F completed in-window still counts toward the 5-cap", () => {
    expect(countActiveFromRows([F], NOW_MS)).toBe(1);
  });
});

describe("toActiveLifecyclePhaseOrNull", () => {
  it("B with recent starts_at is dropped from the active list", () => {
    expect(toActiveLifecyclePhaseOrNull(B.starts_at, B.archived_at, B.extended_until, NOW_MS)).toBeNull();
  });

  it("C stays on the active list as in_progress", () => {
    expect(toActiveLifecyclePhaseOrNull(C.starts_at, C.archived_at, C.extended_until, NOW_MS)).toBe("in_progress");
  });
});
