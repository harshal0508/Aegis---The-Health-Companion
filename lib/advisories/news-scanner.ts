/**
 * REAL-TIME DISTRICT HEALTH NEWS SCANNER
 * --------------------------------------
 * Queries live Google News RSS feeds for Indian districts and health keywords.
 * Returns verified headlines, publisher names, publication timestamps, and direct URLs.
 * Zero API keys required; runs on standard RSS/XML with strict clinical filtering.
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

// Strict whitelist: Article must explicitly reference an infectious or communicable health event
const COMMUNICABLE_DISEASE_REGEX =
  /\b(dengue|malaria|chikungunya|h1n1|swine\s+flu|flu|influenza|viral\s+fever|fever\s+cases|outbreak|epidemic|cases\s+surge|infection|cholera|typhoid|jaundice|hepatitis|measles|zika|nipah|leptospirosis|conjunctivitis)\b/i;

// Strict blacklist: Eliminate hospital administrative scandals, animal sightings, police/crime reports
const IRRELEVANT_CIVIC_REGEX =
  /\b(snake|animal|leopard|dog|accident|crash|police|murder|theft|scam|corruption|brick|tender|stretcher|bribe|fire|arrest|fraud|protest|assault|dowry|bandage\s+row)\b/i;

/**
 * Fetch and parse real news articles for a specific district and disease query.
 */
export async function fetchLiveDistrictHealthNews(
  district: string
): Promise<DistrictNewsArticle[]> {
  try {
    const cleanDistrict = (district || "Indore").trim();
    // Targeted query for communicable disease outbreaks — NO generic "hospital" keyword
    const query = encodeURIComponent(
      `"${cleanDistrict}" (dengue OR malaria OR "viral fever" OR chikungunya OR H1N1 OR "swine flu" OR influenza OR "disease outbreak" OR "infection surge")`
    );
    const feedUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MedAnchorHealthBot/1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      cache: "no-store", // Always fetch fresh to avoid serving stale non-disease items
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
 * Zero-dependency XML parser for Google News RSS items with strict clinical relevance filtering.
 */
export function parseGoogleNewsRss(xml: string, district: string): DistrictNewsArticle[] {
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
    rawTitle = rawTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();

    // 1. Blacklist Check: Drop animal sightings, crime, hospital administration scandals
    if (IRRELEVANT_CIVIC_REGEX.test(rawTitle)) {
      continue;
    }

    // 2. Whitelist Check: Must directly discuss an infectious disease, viral surge, or epidemic
    if (!COMMUNICABLE_DISEASE_REGEX.test(rawTitle)) {
      continue;
    }

    let source = sourceMatch ? sourceMatch[1] : "Local Press";
    source = source.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();

    // Clean up trailing " - Publisher" from Google News title
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
        snippet: `Regional press report concerning communicable disease trends in the ${district} district.`,
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
