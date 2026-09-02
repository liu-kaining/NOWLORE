import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../src/domain/errors.js";
import { assertPublicHttpUrl, fetchWithLimits } from "../src/lib/http.js";

afterEach(() => vi.unstubAllGlobals());

describe("outbound URL policy", () => {
  it.each([
    "http://localhost/test", "http://127.0.0.1/test", "http://10.0.0.1/test", "http://172.16.2.3/test",
    "http://100.64.0.1/test", "http://192.168.1.1/test", "http://169.254.169.254/latest",
    "http://[::1]/test", "http://[fc00::1]/test", "http://metadata.google.internal/",
  ])("blocks private URL %s", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow(AppError);
  });

  it("allows public HTTPS URLs", () => {
    expect(assertPublicHttpUrl("https://example.com/news").hostname).toBe("example.com");
  });

  it("blocks embedded URL credentials", () => {
    expect(() => assertPublicHttpUrl("https://user:password@example.com/news")).toThrow(AppError);
  });

  it("revalidates redirect destinations", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
    })));

    await expect(fetchWithLimits("http://8.8.8.8/start")).rejects.toMatchObject({ code: "PRIVATE_URL_BLOCKED" });
  });

  it("enforces the streamed response limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("12345678901", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })));

    await expect(fetchWithLimits("http://8.8.8.8/data", { maxBytes: 10 })).rejects.toMatchObject({ code: "UPSTREAM_TOO_LARGE" });
  });

  it("rejects unexpected content types", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })));

    await expect(fetchWithLimits("http://8.8.8.8/data")).rejects.toMatchObject({ code: "UPSTREAM_CONTENT_TYPE" });
  });
});
