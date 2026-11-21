import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { MAX_PAGE_CHARS } from "../defaults";
import type { ScrapedPage } from "../types";

const BLOCK = new Set([
  "p", "div", "section", "article", "main", "header", "li", "ul", "ol", "h1", "h2", "h3",
  "h4", "h5", "h6", "tr", "table", "blockquote", "br", "dt", "dd", "figcaption", "details",
  "summary", "aside", "form",
]);
const SKIP = new Set([
  "script", "style", "noscript", "svg", "iframe", "template", "nav", "footer", "canvas",
  "video", "audio", "select", "head",
]);

function isPrivate(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** Refuse anything that isn't a public http(s) host, so the fetcher can't be aimed at internal services. */
async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivate)) throw new Error("URL does not resolve to a public address");
}

async function fetchHtml(start: URL): Promise<{ html: string; finalUrl: string }> {
  let url = start;
  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; PositioningAudit/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error(`Redirect (${res.status}) without a location`);
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new Error(`Site responded ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/html|text\/plain/.test(type)) throw new Error(`Not an HTML page (${type || "unknown type"})`);
    return { html: await res.text(), finalUrl: url.toString() };
  }
  throw new Error("Too many redirects");
}

function extract(html: string) {
  const $ = cheerio.load(html);
  const out: string[] = [];
  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      out.push(node.data);
      return;
    }
    if (node.type !== "tag") return;
    const tag = node.name.toLowerCase();
    if (SKIP.has(tag) || node.attribs["aria-hidden"] === "true" || "hidden" in node.attribs) return;
    const block = BLOCK.has(tag);
    if (block) out.push("\n");
    if (/^h[1-6]$/.test(tag)) out.push("#".repeat(Number(tag[1])) + " ");
    if (tag === "li") out.push("- ");
    if (tag === "img" && node.attribs.alt) out.push(` ${node.attribs.alt} `);
    node.children.forEach(walk);
    if (block) out.push("\n");
  };
  $("body").each((_, el) => walk(el));

  const body = out
    .join("")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/^(#+|-) ?$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const title = $("title").first().text().trim();
  const description =
    $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content");
  const head = [title && `Page title: ${title}`, description && `Meta description: ${description.trim()}`]
    .filter(Boolean)
    .join("\n");
  return { title, text: [head, body].filter(Boolean).join("\n\n") };
}

export async function scrape(raw: string): Promise<ScrapedPage> {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    const { html, finalUrl } = await fetchHtml(url);
    const { title, text } = extract(html);
    const truncated = text.length > MAX_PAGE_CHARS;
    return {
      url: finalUrl,
      ok: true,
      title,
      text: truncated ? text.slice(0, MAX_PAGE_CHARS) : text,
      chars: text.length,
      truncated,
      warning:
        text.length < 400
          ? "Very little text was found. This page is probably rendered with JavaScript, so paste its copy into the positioning doc instead."
          : truncated
            ? `Page text was ${text.length.toLocaleString()} characters; only the first ${MAX_PAGE_CHARS.toLocaleString()} were used.`
            : undefined,
    };
  } catch (err) {
    return { url: raw, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
