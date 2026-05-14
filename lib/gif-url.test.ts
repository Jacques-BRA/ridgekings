import { describe, it, expect } from "vitest";
import { isValidGifUrl } from "./gif-url";

describe("isValidGifUrl", () => {
  it("accepts direct .gif URLs over https", () => {
    expect(isValidGifUrl("https://media.example.com/abc.gif")).toBe(true);
  });
  it("accepts giphy.com URLs even without .gif extension", () => {
    expect(isValidGifUrl("https://giphy.com/gifs/cat-spinning-abc123")).toBe(true);
    expect(isValidGifUrl("https://media.giphy.com/media/abc/giphy.gif")).toBe(true);
  });
  it("accepts tenor.com URLs", () => {
    expect(isValidGifUrl("https://tenor.com/view/jessica-late-abc-123")).toBe(true);
  });
  it("rejects http (must be https)", () => {
    expect(isValidGifUrl("http://media.example.com/abc.gif")).toBe(false);
  });
  it("rejects non-GIF non-host URLs", () => {
    expect(isValidGifUrl("https://example.com/page.html")).toBe(false);
  });
  it("rejects malformed strings", () => {
    expect(isValidGifUrl("not a url")).toBe(false);
    expect(isValidGifUrl("")).toBe(false);
  });
});
