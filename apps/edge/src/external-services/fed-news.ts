/**
 * Monetary policy news from the Federal Reserve Board's public press release feed
 * (https://www.federalreserve.gov/feeds/feeds.htm), free and keyless. The latest FOMC statement
 * is read for its rate decision, which names the market event Sample Wealth's approved content is
 * prepared for.
 */

export const FED_FEED_URL = "https://www.federalreserve.gov/feeds/press_monetary.xml";
const FED_ORIGIN = "https://www.federalreserve.gov/";
const USER_AGENT = "marketing-workbench (fictional demo; no customer data)";

export type FedRelease = { title: string; publishedAt: string; url: string };
export type RateDecision = {
  action: "raise" | "lower" | "maintain";
  /** The market event the decision maps to, for the approved-content lookup. */
  event: "rate-increase" | "rate-cut" | "rate-hold";
  change: string | null;
  targetRange: string | null;
  statement: string;
  publishedAt: string;
  url: string;
};

const EVENTS = { raise: "rate-increase", lower: "rate-cut", maintain: "rate-hold" } as const;

const decode = (text: string) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const tag = (item: string, name: string) =>
  decode(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item)?.[1] ?? "");

/** The feed's items, newest first; links outside the Federal Reserve's site are dropped. */
export function parseFedFeed(xml: string): FedRelease[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item = ""]) => {
      const published = new Date(tag(item, "pubDate"));
      return {
        title: tag(item, "title"),
        publishedAt: Number.isNaN(published.getTime()) ? "" : published.toISOString(),
        url: tag(item, "link"),
      };
    })
    .filter(
      (release) => release.title && release.publishedAt && release.url.startsWith(FED_ORIGIN),
    );
}

/** The rate decision sentence from an FOMC statement page, or null when there isn't one. */
export function parseRateDecision(html: string) {
  const text = decode(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
  const sentence =
    /(?:The Committee )?decided to (raise|lower|maintain) the target range for the federal funds rate[^.]*\./i.exec(
      text,
    );
  if (!sentence) return null;
  const action = (sentence[1] as string).toLowerCase() as RateDecision["action"];
  return {
    action,
    event: EVENTS[action],
    change: /\bby ([\d/ -]+ percentage points?)/i.exec(sentence[0])?.[1]?.trim() ?? null,
    targetRange: /\b(?:to|at) ([\d/ -]+to [\d/ -]+percent)/i.exec(sentence[0])?.[1]?.trim() ?? null,
    statement: sentence[0].trim().replace(/^\w/, (letter) => letter.toUpperCase()),
  };
}

async function get(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ text: string } | { error: string }> {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "text/html,application/xml", "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? { text: await response.text() } : { error: `HTTP ${response.status}` };
  } catch {
    return { error: "unreachable" };
  }
}

/** Recent monetary policy releases and the rate decision in the latest FOMC statement. */
export async function fetchFedAnnouncements(
  fetchImpl: typeof fetch = fetch,
): Promise<{ decision: RateDecision | null; releases: FedRelease[] } | { error: string }> {
  const feed = await get(FED_FEED_URL, fetchImpl);
  if ("error" in feed) return { error: `the Federal Reserve feed returned ${feed.error}` };
  const releases = parseFedFeed(feed.text);
  if (!releases.length) return { error: "the Federal Reserve feed had no releases" };
  const latest = releases.find((release) => /\bFOMC statement\b/i.test(release.title));
  if (!latest) return { decision: null, releases };
  const page = await get(latest.url, fetchImpl);
  const parsed = "text" in page ? parseRateDecision(page.text) : null;
  return {
    decision: parsed ? { ...parsed, publishedAt: latest.publishedAt, url: latest.url } : null,
    releases,
  };
}
