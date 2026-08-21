import { describe, expect, it } from "vitest";
import type { MediaAsset, MessageTemplate } from "@/types";
import {
  headerKindFromTemplate,
  MEDIA_HEADER_KINDS,
  resolveHeaderMedia,
} from "./broadcast-media";

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    account_id: "acc-1",
    bucket: "media-library",
    path: "account-acc-1/1-foo.png",
    file_name: "foo.png",
    mime_type: "image/png",
    kind: "image",
    size_bytes: 1024,
    public_url: "https://cdn.example.com/foo.png",
    uploaded_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function tpl(
  header_type: MessageTemplate["header_type"],
  header_media_url?: string | null,
): Pick<MessageTemplate, "header_type" | "header_media_url"> {
  return { header_type, header_media_url };
}

describe("headerKindFromTemplate", () => {
  it.each(MEDIA_HEADER_KINDS)("returns %s for that header_type", (k) => {
    expect(headerKindFromTemplate(tpl(k))).toBe(k);
  });

  it.each(["text" as const, undefined, null, "audio"])(
    "returns null for non-media header_type %s",
    (t) => {
      // @ts-expect-error — testing runtime guard for bad values
      expect(headerKindFromTemplate(tpl(t))).toBeNull();
    },
  );

  it("treats an empty string header_type as non-media", () => {
    // @ts-expect-error — runtime defence
    expect(headerKindFromTemplate(tpl(""))).toBeNull();
  });
});

describe("resolveHeaderMedia", () => {
  it("uses the library asset URL when one is selected", () => {
    const asset = makeAsset();
    const r = resolveHeaderMedia({
      selectedAsset: asset,
      templateDefaultUrl: "https://tpl.default/x.jpg",
    });
    expect(r.url).toBe(asset.public_url);
    expect(r.assetId).toBe(asset.id);
    expect(r.fromTemplateDefault).toBe(false);
  });

  it("falls back to the template default when no asset picked", () => {
    const r = resolveHeaderMedia({
      selectedAsset: null,
      templateDefaultUrl: "https://tpl.default/x.jpg",
    });
    expect(r.url).toBe("https://tpl.default/x.jpg");
    expect(r.assetId).toBeNull();
    expect(r.fromTemplateDefault).toBe(true);
  });

  it("returns empty url and no asset when nothing is available", () => {
    const r = resolveHeaderMedia({
      selectedAsset: null,
      templateDefaultUrl: null,
    });
    expect(r.url).toBe("");
    expect(r.assetId).toBeNull();
    expect(r.fromTemplateDefault).toBe(false);
  });

  it("trims whitespace from the template default", () => {
    const r = resolveHeaderMedia({
      selectedAsset: null,
      templateDefaultUrl: "   https://tpl.default/x.jpg   ",
    });
    expect(r.url).toBe("https://tpl.default/x.jpg");
    expect(r.fromTemplateDefault).toBe(true);
  });

  it("treats an empty string template default as no default", () => {
    const r = resolveHeaderMedia({
      selectedAsset: null,
      templateDefaultUrl: "",
    });
    expect(r.url).toBe("");
    expect(r.fromTemplateDefault).toBe(false);
  });

  it("prefers the asset URL even when the template has a default", () => {
    const asset = makeAsset({ public_url: "https://cdn/asset.png" });
    const r = resolveHeaderMedia({
      selectedAsset: asset,
      templateDefaultUrl: "https://tpl.default/x.jpg",
    });
    expect(r.url).toBe("https://cdn/asset.png");
    expect(r.assetId).toBe(asset.id);
    expect(r.fromTemplateDefault).toBe(false);
  });

  it("handles undefined templateDefaultUrl the same as null", () => {
    const r = resolveHeaderMedia({ selectedAsset: null });
    expect(r.url).toBe("");
    expect(r.fromTemplateDefault).toBe(false);
  });
});