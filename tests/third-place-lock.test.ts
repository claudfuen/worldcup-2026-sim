// Regression test for lockedThirdSlots (lib/sim/thirdPlace.ts): a guaranteed-advancing third has a LOCKED
// Round-of-32 bracket slot iff its group maps to the same Annex C slot across every table row that contains
// the guaranteed-advancing set. This mirrors the real 2026 finding — with Sweden(F)/Ecuador(E)/Bosnia(B)
// all clinched as best-thirds, Bosnia's slot is invariant (1D, faces the Group D winner) while Sweden's and
// Ecuador's still move with the qualifying set.
import { describe, it, expect } from "vitest";
import { lockedThirdSlots } from "../lib/sim/thirdPlace";

describe("lockedThirdSlots", () => {
  it("locks Bosnia (group B) to slot 1D, but not Sweden (F) or Ecuador (E)", () => {
    const locked = lockedThirdSlots(["B", "E", "F"]);
    expect(locked["B"]).toBe("1D"); // invariant across all 126 rows containing B,E,F
    expect(locked["E"]).toBeUndefined();
    expect(locked["F"]).toBeUndefined();
  });

  it("returns an empty map when no third is guaranteed yet", () => {
    expect(lockedThirdSlots([])).toEqual({});
  });

  it("locks more once eliminated groups are excluded (the real Ecuador case)", () => {
    // Real 2026 state: thirds B,D,E,F,I,L guaranteed in; C and H thirds eliminated. Without excluding the
    // eliminated groups, Ecuador (E) looks variable (rows containing C/H route E elsewhere). Excluding them —
    // those sets can never happen — proves E is locked to 1A (faces the Group A winner, Mexico).
    const guaranteed = ["B", "D", "E", "F", "I", "L"];
    expect(lockedThirdSlots(guaranteed)["E"]).toBeUndefined(); // hidden by impossible C/H sets
    expect(lockedThirdSlots(guaranteed, ["C", "H"])["E"]).toBe("1A"); // genuinely locked
    // excluding eliminated groups can only ever lock the same or more slots (sound)
    const a = lockedThirdSlots(guaranteed);
    const b = lockedThirdSlots(guaranteed, ["C", "H"]);
    for (const g of Object.keys(a)) expect(b[g]).toBe(a[g]);
  });

  it("returns slots only for groups whose Annex C slot is single-valued across the matching rows", () => {
    const locked = lockedThirdSlots(["B", "E", "F"]);
    for (const slot of Object.values(locked)) expect(slot).toMatch(/^1[A-L]$/);
  });
});
