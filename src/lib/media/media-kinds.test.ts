import { describe, expect, it } from "vitest";
import {
  checkMediaFile,
  escapeLikeTerm,
  formatBytes,
  kindFromMime,
  maxBytesForKind,
  MEDIA_LIBRARY_ACCEPT,
  MEDIA_LIBRARY_MIME_BY_KIND,
} from "./media-kinds";

describe("kindFromMime", () => {
  it("classifies images", () => {
    expect(kindFromMime("image/png")).toBe("image");
    expect(kindFromMime("image/jpeg")).toBe("image");
    expect(kindFromMime("image/webp")).toBe("image");
  });

  it("classifies videos", () => {
    expect(kindFromMime("video/mp4")).toBe("video");
    expect(kindFromMime("video/3gpp")).toBe("video");
  });

  it("classifies documents", () => {
    expect(kindFromMime("application/pdf")).toBe("document");
    expect(kindFromMime("application/msword")).toBe("document");
    expect(kindFromMime("text/plain")).toBe("document");
    expect(
      kindFromMime(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("document");
  });

  it("rejects audio and other non-campaign types", () => {
    // Audio is excluded on purpose: WhatsApp template headers don't
    // support it (voice notes belong to chat-media, not the library).
    expect(kindFromMime("audio/ogg")).toBeNull();
    expect(kindFromMime("image/gif")).toBeNull();
    expect(kindFromMime("video/webm")).toBeNull();
    expect(kindFromMime("")).toBeNull();
  });
});

describe("MEDIA_LIBRARY_ACCEPT", () => {
  it("contains every allow-listed MIME exactly once", () => {
    const all = Object.values(MEDIA_LIBRARY_MIME_BY_KIND).flat();
    const parts = MEDIA_LIBRARY_ACCEPT.split(",");
    expect(parts).toHaveLength(all.length);
    for (const mime of all) expect(parts).toContain(mime);
  });
});

describe("checkMediaFile", () => {
  it("accepts a small png", () => {
    expect(checkMediaFile({ size: 1000, type: "image/png" })).toEqual({
      ok: true,
      kind: "image",
    });
  });

  it("rejects an unsupported type before looking at size", () => {
    expect(checkMediaFile({ size: 1, type: "image/gif" })).toEqual({
      ok: false,
      reason: "unsupported-type",
    });
  });

  it("rejects an image over Meta's 5 MB cap", () => {
    const result = checkMediaFile({
      size: 5 * 1024 * 1024 + 1,
      type: "image/jpeg",
    });
    expect(result).toEqual({
      ok: false,
      reason: "too-large",
      kind: "image",
      maxBytes: 5 * 1024 * 1024,
    });
  });

  it("accepts a 6 MB video (over the image cap, under the video cap)", () => {
    expect(
      checkMediaFile({ size: 6 * 1024 * 1024, type: "video/mp4" }),
    ).toEqual({ ok: true, kind: "video" });
  });

  it("rejects a document over the 16 MB bucket limit", () => {
    const result = checkMediaFile({
      size: 16 * 1024 * 1024 + 1,
      type: "application/pdf",
    });
    expect(result).toMatchObject({ ok: false, reason: "too-large" });
  });

  it("mirrors the per-kind ceilings of MEDIA_MAX_BYTES_BY_KIND", () => {
    expect(maxBytesForKind("image")).toBe(5 * 1024 * 1024);
    expect(maxBytesForKind("video")).toBe(16 * 1024 * 1024);
    expect(maxBytesForKind("document")).toBe(16 * 1024 * 1024);
  });
});

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats KB with one decimal under 100", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(99 * 1024)).toBe("99.0 KB");
    expect(formatBytes(150 * 1024)).toBe("150 KB");
  });

  it("formats MB", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(16 * 1024 * 1024)).toBe("16.0 MB");
  });

  it("guards nonsense input", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("escapeLikeTerm", () => {
  it("escapes LIKE wildcards so they match literally", () => {
    expect(escapeLikeTerm("100% real")).toBe("100\\% real");
    expect(escapeLikeTerm("a_b")).toBe("a\\_b");
  });

  it("leaves normal terms untouched", () => {
    expect(escapeLikeTerm("promo marzo")).toBe("promo marzo");
  });
});
