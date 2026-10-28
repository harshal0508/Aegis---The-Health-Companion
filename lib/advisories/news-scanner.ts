/**
 * REAL-TIME DISTRICT HEALTH NEWS SCANNER
 * --------------------------------------
 * Queries live Google News RSS feeds for Indian districts and health keywords.
 * Returns verified headlines, publisher names, publication timestamps, and direct URLs.
 * Zero API keys required; runs on standard RSS/XML.
 */

export interface DistrictNewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  snippet: string;
  district: string;
}

/**
 * Fetch and parse real news articles for a specific district and disease query.
 */
export async function fetchLiveDistrictHealthNews(
  district: string
): Promise<DistrictNewsArticle[]> {
  try {
    const cleanDistrict = (district || "Indore").trim();
    // Targeted query for communicable health events in that district
    const query = encodeURIComponent(
      `"${cleanDistrict}" (dengue OR malaria OR viral fever OR chikungunya OR outbreak OR hospital)`
    );
    const feedUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MedAnchorHealthBot/1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      next: { revalidate: 3600 }, // Cache on server for 1 hour to prevent rate limits
    });

    if (!res.ok) {
      console.warn(`[NewsScanner] RSS fetch failed with status ${res.status}`);
      return [];
    }

    const xmlText = await res.text();
    return parseGoogleNewsRss(xmlText, cleanDistrict);
  } catch (err) {
    console.error("[NewsScanner] Error fetching live district news:", err);
    return [];
  }
}

/**
 * Lightweight, zero-dependency XML parser for Google News RSS items.
 */
function parseGoogleNewsRss(xml: string, district: string): DistrictNewsArticle[] {
  const articles: DistrictNewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && articles.length < 6) {
    const itemXml = match[1];

    const titleMatch = /<title>(.*?)<\/title>/i.exec(itemXml);
    const linkMatch = /<link>(.*?)<\/link>/i.exec(itemXml);
    const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/i.exec(itemXml);
    const sourceMatch = /<source[^>]*>(.*?)<\/source>/i.exec(itemXml);

    let rawTitle = titleMatch ? titleMatch[1] : "";
    // Clean up CDATA or HTML entities
    rawTitle = rawTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();

    let source = sourceMatch ? sourceMatch[1] : "Local Press";
    source = source.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();

    // Often Google News appends " - Publisher" at the end of the title
    if (rawTitle.includes(" - ")) {
      const parts = rawTitle.split(" - ");
      if (parts.length > 1) {
        source = parts.pop() || source;
        rawTitle = parts.join(" - ");
      }
    }

    const url = linkMatch ? linkMatch[1].trim() : "#";
    const publishedAt = pubDateMatch
      ? new Date(pubDateMatch[1]).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    if (rawTitle && url && url !== "#") {
      articles.push({
        id: `news-${articles.length}-${Buffer.from(rawTitle.slice(0, 20)).toString("hex")}`,
        title: decodeXmlEntities(rawTitle),
        source: decodeXmlEntities(source),
        url,
        publishedAt,
        snippet: `Reported by ${source} regarding health developments in ${district} area.`,
        district,
      });
    }
  }

  return articles;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
