import { describe, expect, it } from "vitest";
import {
  aggregateMediaStats,
  emptyMediaStats,
  type MediaStatsRow,
} from "./media-stats";

function row(kind: string, size_bytes: number | null): MediaStatsRow {
  return { kind, size_bytes };
}

describe("aggregateMediaStats", () => {
  it("returns the empty baseline for no rows", () => {
    expect(aggregateMediaStats([])).toEqual(emptyMediaStats());
  });

  it("counts and sums by kind", () => {
    const stats = aggregateMediaStats([
      row("image", 1024),
      row("image", 2048),
      row("video", 16 * 1024 * 1024),
      row("document", 500),
    ]);
    expect(stats.totalBytes).toBe(1024 + 2048 + 16 * 1024 * 1024 + 500);
    expect(stats.counts).toEqual({ image: 2, video: 1, document: 1 });
    expect(stats.bytes.image).toBe(1024 + 2048);
    expect(stats.bytes.video).toBe(16 * 1024 * 1024);
    expect(stats.bytes.document).toBe(500);
  });

  it("ignores rows with an unknown kind", () => {
    const stats = aggregateMediaStats([
      row("image", 100),
      row("audio", 9999),
      row("nonsense", 42),
    ]);
    expect(stats.totalBytes).toBe(100);
    expect(stats.counts).toEqual({ image: 1, video: 0, document: 0 });
  });

  it("treats null/negative sizes as zero but still counts them", () => {
    const stats = aggregateMediaStats([
      row("video", null),
      row("video", -10),
    ]);
    expect(stats.counts.video).toBe(2);
    expect(stats.bytes.video).toBe(0);
    expect(stats.totalBytes).toBe(0);
  });
});
