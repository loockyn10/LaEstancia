import { describe, expect, it } from "vitest";
import { posPwaWorkbox } from "./pwa";

describe("POS offline app shell", () => {
  it("precaches the navigation shell and local static assets", () => {
    expect(posPwaWorkbox.navigateFallback).toBe("/index.html");
    expect(posPwaWorkbox.globPatterns).toContain("**/*.{js,css,html,svg,png,ico,woff2}");
    expect(posPwaWorkbox.cleanupOutdatedCaches).toBe(true);
  });

  it("does not configure runtime caching for Supabase responses", () => {
    expect("runtimeCaching" in posPwaWorkbox).toBe(false);
  });
});
