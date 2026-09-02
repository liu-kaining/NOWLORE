import type { Project } from "../domain/schemas.js";

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

function wrap(input: string, max = 36): string[] {
  const words = input.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

export function renderProjectPoster(project: Project): string {
  const taglineLines = wrap(project.tagline);
  const lineSvg = taglineLines.map((line, index) => `<text x="84" y="${610 + index * 52}" class="tagline">${escapeXml(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" role="img" aria-labelledby="title desc">
<title id="title">${escapeXml(project.name)} by NOWLORE</title>
<desc id="desc">${escapeXml(project.tagline)}</desc>
<rect width="1200" height="1200" fill="#0a0b0d"/>
<circle cx="940" cy="218" r="146" fill="none" stroke="#b7ff35" stroke-width="2" opacity=".72"/>
<circle cx="940" cy="218" r="96" fill="none" stroke="#b7ff35" stroke-width="2" opacity=".46"/>
<circle cx="940" cy="218" r="46" fill="#b7ff35"/>
<path d="M940 218 L1120 92" stroke="#b7ff35" stroke-width="4"/>
<rect x="70" y="70" width="1060" height="1060" fill="none" stroke="#f5f1e8" stroke-width="2" opacity=".28"/>
<text x="84" y="128" fill="#b7ff35" font-family="ui-monospace, monospace" font-size="28" letter-spacing="5">NOWLORE DROP ${String(project.sequence).padStart(3, "0")}</text>
<text x="84" y="430" fill="#f5f1e8" font-family="Arial, Helvetica, sans-serif" font-size="122" font-weight="800">${escapeXml(project.symbol)}</text>
<text x="84" y="522" fill="#f5f1e8" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="600">${escapeXml(project.name)}</text>
<g fill="#a9a69f" font-family="Arial, Helvetica, sans-serif" font-size="38">${lineSvg}</g>
<line x1="84" y1="875" x2="1116" y2="875" stroke="#f5f1e8" opacity=".3"/>
<text x="84" y="944" fill="#f5f1e8" font-family="ui-monospace, monospace" font-size="25">SHORT-CYCLE CULTURE EXPERIMENT · NOT A PROMISE OF VALUE</text>
<text x="84" y="1010" fill="#b7ff35" font-family="ui-monospace, monospace" font-size="25">MINT THE MOMENT. KEEP THE RECORD.</text>
<text x="84" y="1076" fill="#77756f" font-family="ui-monospace, monospace" font-size="20">${escapeXml(project.id)}</text>
</svg>`;
}
