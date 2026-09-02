const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
]);

export function normalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  url.searchParams.sort();
  return url.toString();
}

export function cleanText(input: string, maxLength = 4_000): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\p{Cc}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "nowlore-drop";
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "will", "are", "was", "have", "has", "into", "about",
  "what", "when", "where", "who", "why", "how", "your", "you", "its", "new", "latest", "just", "after", "before",
  "一个", "这个", "那个", "什么", "如何", "以及", "已经", "正在", "可能", "关于", "因为", "所以", "但是", "还是",
]);

export function keywords(input: string): string[] {
  const latin = input.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? [];
  const han = input.match(/[\p{Script=Han}]{2,6}/gu) ?? [];
  return [...new Set([...latin, ...han].filter((token) => !STOP_WORDS.has(token)))].slice(0, 40);
}

export function jaccard(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
