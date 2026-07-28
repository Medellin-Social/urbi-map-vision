import { describe, it, expect } from "vitest";
import { toEmbedSrc } from "./embed";

describe("toEmbedSrc", () => {
  it("permite hosts de la whitelist tal cual", () => {
    expect(toEmbedSrc("https://my.matterport.com/show/?m=abc")).toBe("https://my.matterport.com/show/?m=abc");
    expect(toEmbedSrc("https://kuula.co/share/xyz")).toBe("https://kuula.co/share/xyz");
  });
  it("transforma youtube/vimeo a URL de embed", () => {
    expect(toEmbedSrc("https://www.youtube.com/watch?v=ID123")).toBe("https://www.youtube.com/embed/ID123");
    expect(toEmbedSrc("https://youtu.be/ID123")).toBe("https://www.youtube.com/embed/ID123");
    expect(toEmbedSrc("https://vimeo.com/76543")).toBe("https://player.vimeo.com/video/76543");
  });
  it("bloquea hosts fuera de la whitelist", () => {
    expect(toEmbedSrc("https://evil.com/x")).toBeNull();
    expect(toEmbedSrc("https://matterport.com.evil.com/x")).toBeNull(); // no confundir sufijo
    expect(toEmbedSrc("javascript:alert(1)")).toBeNull();
    expect(toEmbedSrc("http://my.matterport.com/show")).toBeNull();     // solo https
  });
  it("null/vacío → null", () => {
    expect(toEmbedSrc(null)).toBeNull();
    expect(toEmbedSrc("")).toBeNull();
    expect(toEmbedSrc("no-es-url")).toBeNull();
  });
});
