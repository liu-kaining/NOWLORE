import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "../domain/errors.js";

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  maxBytes?: number;
  allowedContentTypes?: RegExp;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_CONTENT_TYPES = /^(application\/(?:json|[a-z0-9.+-]*\+json|xml|rss\+xml|atom\+xml)|text\/(?:xml|plain))(?:\s*;|$)/i;
const MAX_REDIRECTS = 4;

export function assertPublicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("INVALID_URL", "URL is invalid", 400);
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new AppError("INVALID_URL", "Only http and https URLs are allowed", 400);
  }
  if (url.username || url.password) {
    throw new AppError("INVALID_URL", "URLs containing credentials are not allowed", 400);
  }
  const hostname = normalizeHostname(url.hostname);
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal") {
    throw new AppError("PRIVATE_URL_BLOCKED", "Private or metadata URLs are not allowed", 400);
  }
  if (isIP(hostname) !== 0 && isPrivateIpAddress(hostname)) throwPrivateUrl();
  return url;
}

export async function fetchWithLimits(input: string, options: FetchOptions = {}): Promise<Response> {
  const {
    timeoutMs = 10_000,
    maxBytes = 2_000_000,
    allowedContentTypes = DEFAULT_CONTENT_TYPES,
    headers,
    ...requestOptions
  } = options;
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("user-agent")) requestHeaders.set("user-agent", "NOWLORE/0.1 (+https://thetamind.ai)");
  if (!requestHeaders.has("accept")) requestHeaders.set("accept", "application/json, application/rss+xml, application/xml, text/xml, text/plain;q=0.8");
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);
  let url = assertPublicHttpUrl(input);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicDestination(url);
    const response = await fetch(url, { ...requestOptions, headers: requestHeaders, signal, redirect: "manual" });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new AppError("UPSTREAM_REDIRECT_INVALID", "Upstream redirect is missing a location", 502);
      if (redirects === MAX_REDIRECTS) throw new AppError("UPSTREAM_REDIRECT_LIMIT", "Upstream exceeded the redirect limit", 502);
      const next = assertPublicHttpUrl(new URL(location, url).toString());
      if (next.protocol !== url.protocol) throw new AppError("UPSTREAM_REDIRECT_BLOCKED", "Cross-protocol redirects are not allowed", 502);
      if (next.origin !== url.origin) {
        requestHeaders.delete("authorization");
        requestHeaders.delete("cookie");
      }
      url = next;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError("UPSTREAM_HTTP_ERROR", `Upstream returned ${response.status}`, 502, { host: url.host });
    }
    const contentType = response.headers.get("content-type");
    if (contentType && !allowedContentTypes.test(contentType)) {
      await response.body?.cancel();
      throw new AppError("UPSTREAM_CONTENT_TYPE", "Upstream returned an unsupported content type", 502, { host: url.host });
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxBytes) {
      await response.body?.cancel();
      throw new AppError("UPSTREAM_TOO_LARGE", "Upstream response exceeds the configured limit", 502);
    }
    return bufferResponse(response, maxBytes);
  }

  throw new AppError("UPSTREAM_REDIRECT_LIMIT", "Upstream exceeded the redirect limit", 502);
}

export async function responseTextLimited(response: Response, maxBytes = 2_000_000): Promise<string> {
  const text = await response.text();
  if (Buffer.byteLength(text) > maxBytes) {
    throw new AppError("UPSTREAM_TOO_LARGE", "Upstream response exceeds the configured limit", 502);
  }
  return text;
}

async function assertPublicDestination(url: URL): Promise<void> {
  const hostname = normalizeHostname(url.hostname);
  if (isIP(hostname) !== 0) {
    if (isPrivateIpAddress(hostname)) throwPrivateUrl();
    return;
  }
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError("UPSTREAM_DNS_ERROR", "Upstream hostname could not be resolved", 502, { host: hostname });
  }
  if (addresses.length === 0) throw new AppError("UPSTREAM_DNS_ERROR", "Upstream hostname returned no addresses", 502, { host: hostname });
  if (addresses.some(({ address }) => isPrivateIpAddress(address))) throwPrivateUrl();
}

function isPrivateIpAddress(input: string): boolean {
  const address = normalizeHostname(input).toLowerCase();
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 0 && c === 2))) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  if (isIP(address) === 6) {
    return address === "::" || address === "::1" || address.startsWith("::ffff:") ||
      /^f[cd]/.test(address) || /^fe[89ab]/.test(address) || address.startsWith("ff") ||
      address.startsWith("2001:db8:");
  }
  return false;
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function throwPrivateUrl(): never {
  throw new AppError("PRIVATE_URL_BLOCKED", "Private or metadata URLs are not allowed", 400);
}

async function bufferResponse(response: Response, maxBytes: number): Promise<Response> {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError("UPSTREAM_TOO_LARGE", "Upstream response exceeds the configured limit", 502);
    }
    chunks.push(value);
  }
  return new Response(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
