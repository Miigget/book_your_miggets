import { describe, expect, it } from "vitest";
import { aimDegToward, nearestPointOnRect, pistolShotToRect, rayHitRect, spinDeg } from "@/lib/gores-shots";

const button = { left: 400, top: 200, right: 560, bottom: 264 };

describe("rayHitRect", () => {
  it("hits the left edge when aiming at the rect center from the left", () => {
    const hit = rayHitRect(80, 232, 480, 232, button);
    expect(hit).toEqual({ x: 400, y: 232 });
  });

  it("hits the top edge when aiming at the rect center from above", () => {
    const hit = rayHitRect(480, 40, 480, 232, button);
    expect(hit).toEqual({ x: 480, y: 200 });
  });

  it("returns null when the origin is already inside the rect", () => {
    expect(rayHitRect(420, 220, 480, 232, button)).toBeNull();
  });

  it("returns null when the segment never meets the rect", () => {
    expect(rayHitRect(80, 40, 80, 80, button)).toBeNull();
  });
});

describe("pistolShotToRect", () => {
  it("flies from a level muzzle to the Create a Run left edge", () => {
    const path = pistolShotToRect(
      { left: 90, top: 220, width: 20, height: 12 },
      { left: 400, top: 200, width: 160, height: 64 },
    );
    expect(path).toEqual({ startX: 100, startY: 226, hitX: 400, hitY: 226 });
  });

  it("hits the top-left corner when the muzzle is above the button", () => {
    const path = pistolShotToRect(
      { left: 90, top: 40, width: 20, height: 12 },
      { left: 400, top: 200, width: 160, height: 64 },
    );
    expect(path).toEqual({ startX: 100, startY: 46, hitX: 400, hitY: 200 });
  });

  it("skips a degenerate zero-size muzzle", () => {
    expect(
      pistolShotToRect({ left: 0, top: 0, width: 0, height: 0 }, { left: 400, top: 200, width: 160, height: 64 }),
    ).toBeNull();
  });
});

describe("nearestPointOnRect", () => {
  it("clamps to the left edge when the point is to the left", () => {
    expect(nearestPointOnRect(80, 232, button)).toEqual({ x: 400, y: 232 });
  });

  it("clamps to the top-left corner when the point is above-left", () => {
    expect(nearestPointOnRect(80, 40, button)).toEqual({ x: 400, y: 200 });
  });
});

describe("aimDegToward", () => {
  it("is 0° along local +X (barrel rest pose)", () => {
    expect(aimDegToward(40, 0)).toBe(0);
  });

  it("is 90° along local +Y (down on screen)", () => {
    expect(aimDegToward(0, 10)).toBe(90);
  });
});

describe("spinDeg", () => {
  it("starts at the current aim and lands 360° later", () => {
    expect(spinDeg(-20, 0)).toBe(-20);
    expect(spinDeg(-20, 1)).toBe(340);
  });
});
