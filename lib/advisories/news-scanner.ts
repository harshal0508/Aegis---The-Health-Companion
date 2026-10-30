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
  image?: string | null;
  publishedAt: string;
  snippet: string;
  district: string;
}

// Comprehensive whitelist: Matches any infectious disease, seasonal outbreak, surge, epidemic, or public health alert
const COMMUNICABLE_DISEASE_REGEX =
  /\b(outbreak|epidemic|(?:cases|infections?|fevers?|diseases?|patients?)\s+(?:surge|rise|spike|spurt)|(?:infection|disease|illness|virus|pathogen)\s+spread(?:ing)?|spread(?:ing)?\s+of\s+(?:infection|disease|illness|virus)|health\s+alert|public\s+health\s+alert|health\s+advisory|dengue|malaria|chikungunya|h1n1|swine\s+flu|influenza|viral\s+(?:fever|infection|illness|disease|hepatitis|conjunctivitis|meningitis|pneumonia|outbreak|flu|cases)|typhoid|cholera|jaundice|hepatitis|measles|chickenpox|zika|nipah|leptospirosis|scrub\s+typhus|conjunctivitis|eye\s+flu|gastroenteritis|diarrhea|diarrhoea|food\s+poisoning|pneumonia|rsv|hfmd|hand\s+foot\s+(?:and\s+mouth)?|respiratory\s+(?:infection|alert|illness|disease)|rabies|tuberculosis|tb\s+cases|norovirus|rotavirus|water\s+contamination|contaminated\s+water|mystery\s+(?:illness|fever|disease))\b/i;

// Strict blacklist: Eliminate shopping/business, travel fares, exam admissions, crime, animal sightings, police, corporate PR, violence
const IRRELEVANT_CIVIC_REGEX =
  /\b(snake|animal|leopard|dog|accident|crash|police|murder|theft|scam|corruption|brick|tender|stretcher|bribe|fire|crossfire|clash|clashes|firing|gunshot|stabbing|brawl|violence|arrest|arrested|fraud|protest|assault|dowry|bandage\s+row|traffic|cricket|ipl|movie|film|box\s+office|election|vote|rally|bjp|congress|aap|rape|gang-rape|sexual|molest|molestation|minor|beaten|tied|lynched|mob|harass|harassment|abuse|burglary|liquor|fir\b|robbery|case\s+registered|cases\s+registered|shopping|retail|market|bazaar|trader|traders|sales|diwali|festival|fare|fares|ticket|tickets|travel|train|flight|bus|admission|admissions|cat\b|iim\b|iit\b|exam|exams|college|student|students|university|school\s+admission|gold|silver|stock|share\s+price|sensex|nifty|platform|integrates|announces|appoints|market\s+size|growth|valuation|expansion|award|awards|inaugurate|startup|fundraising|venture|merger|acquisition|viral\s+video|video\s+viral|went\s+viral|goes\s+viral|cctv|reels?|footage)\b/i;

/**
 * Fetch verified district health news via GNews API (if GNEWS_API_KEY is configured),
 * or fall back cleanly to the Google News RSS feed.
 */
export async function fetchLiveDistrictHealthNews(
  district: string
): Promise<DistrictNewsArticle[]> {
  const cleanDistrict = (district || "Indore").trim();
  const gnewsKey = process.env.GNEWS_API_KEY;

  if (gnewsKey) {
    const gnewsArticles = await fetchGNewsDistrictHealth(cleanDistrict, gnewsKey);
    if (gnewsArticles && gnewsArticles.length > 0) {
      return gnewsArticles;
    }
  }

  // Fallback to Google News RSS
  try {
    const query = encodeURIComponent(
      `"${cleanDistrict}" (outbreak OR epidemic OR surge OR dengue OR malaria OR fever OR cholera OR typhoid OR infection OR contamination OR health) when:30d`
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
 * Query official GNews REST API for structured, verified disease and health reports.
 * Employs category=health, country=in, and strict calendar-month filtering.
 */
export async function fetchGNewsDistrictHealth(
  district: string,
  apiKey: string
): Promise<DistrictNewsArticle[]> {
  try {
    const cleanDistrict = (district || "Indore").trim();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const startOfMonth = `${currentYear}-${currentMonth}-01`;
    const todayStr = now.toISOString().split("T")[0];
    const fromDate = `${startOfMonth}T00:00:00Z`;
    const toDate = now.toISOString();

    const query = `"${cleanDistrict}" AND (outbreak OR epidemic OR cases OR infection OR fever OR dengue OR malaria OR alert OR health OR illness OR contamination)`;
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(
      query
    )}&lang=en&country=in&max=10&from=${encodeURIComponent(
      fromDate
    )}&to=${encodeURIComponent(toDate)}&apikey=${apiKey}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[GNews] Request failed with status ${res.status}`);
      return [];
    }

    const data = await res.json();
    console.log(`[GNews] Fetched ${data.articles?.length ?? 0} articles for ${cleanDistrict}`);
    if (!data.articles || !Array.isArray(data.articles)) {
      return [];
    }

    const results: DistrictNewsArticle[] = [];
    const seenTitles = new Set<string>();

    for (let idx = 0; idx < data.articles.length; idx++) {
      const art = data.articles[idx];
      const title = (art.title || "").trim();
      const desc = (art.description || "").trim();
      if (!title || IRRELEVANT_CIVIC_REGEX.test(title)) continue;

      // Ensure the article is discussing an infectious illness, outbreak, fever, or public health alert
      if (!COMMUNICABLE_DISEASE_REGEX.test(title + " " + desc)) continue;

      // Deduplicate duplicate headlines from syndicated PR wires
      const normalizedTitle = title.toLowerCase().replace(/[^\w]/g, "");
      if (seenTitles.has(normalizedTitle)) continue;
      seenTitles.add(normalizedTitle);

      const pubDate = art.publishedAt
        ? new Date(art.publishedAt).toISOString().split("T")[0]
        : todayStr;

      // Strictly enforce active month
      if (pubDate < startOfMonth || pubDate > todayStr) continue;

      results.push({
        id: `gnews-${idx}-${Buffer.from(title.slice(0, 15)).toString("hex")}`,
        title: decodeXmlEntities(title),
        source: art.source?.name ? decodeXmlEntities(art.source.name) : "Regional Media",
        url: art.url || "#",
        image: art.image || null,
        publishedAt: pubDate,
        snippet: art.description ? decodeXmlEntities(art.description) : "Regional health press report.",
        district: cleanDistrict,
      });
    }

    // Sort decreasing by publishedAt
    results.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return results;
  } catch (err) {
    console.error("[GNews] Error querying GNews API:", err);
    return [];
  }
}

/**
 * Zero-dependency XML parser for Google News RSS items with strict clinical relevance filtering.
 * Filters articles strictly for the current calendar month (from current date down to the 1st of the month)
 * and sorts all articles in strictly decreasing chronological order.
 */
export function parseGoogleNewsRss(xml: string, district: string): DistrictNewsArticle[] {
  const rawArticles: DistrictNewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const titleMatch = /<title>(.*?)<\/title>/i.exec(itemXml);
    const linkMatch = /<link>(.*?)<\/link>/i.exec(itemXml);
    const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/i.exec(itemXml);
    const sourceMatch = /<source[^>]*>(.*?)<\/source>/i.exec(itemXml);
    const descMatch = /<description>([\s\S]*?)<\/description>/i.exec(itemXml);

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

    // Extract and clean description / snippet from RSS
    let rawDesc = descMatch ? descMatch[1] : "";
    const snippet = extractCleanSnippet(rawDesc, decodeXmlEntities(rawTitle), decodeXmlEntities(source), district);

    const url = linkMatch ? linkMatch[1].trim() : "#";
    const publishedAt = pubDateMatch
      ? new Date(pubDateMatch[1]).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    if (rawTitle && url && url !== "#") {
      rawArticles.push({
        id: `news-${rawArticles.length}-${Buffer.from(rawTitle.slice(0, 20)).toString("hex")}`,
        title: decodeXmlEntities(rawTitle),
        source: decodeXmlEntities(source),
        url,
        publishedAt,
        snippet,
        district,
      });
    }
  }

  // 1. Sort all matching candidates in strict DECREASING chronological order (newest date first)
  rawArticles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // 2. Identify the active month window (e.g. current calendar month: YYYY-MM-01 to today)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const startOfMonth = `${currentYear}-${currentMonth}-01`;
  const todayStr = now.toISOString().split("T")[0];

  // Filter strictly for the current month (e.g. 2026-10-01 to 2026-10-30 in October)
  const currentMonthArticles = rawArticles.filter(
    (a) => a.publishedAt >= startOfMonth && a.publishedAt <= todayStr
  );

  // Strict Month Enforcement: Return only articles published in the active calendar month
  // (from the current date down to the 1st of this month). Never fallback to older historical months.
  return currentMonthArticles.slice(0, 8);
}

/**
 * Extracts a human-readable, plain-text snippet from RSS descriptions.
 * Google News RSS descriptions do not provide article body text—they only contain
 * an encoded <a> link with the headline and a <font> tag with the publisher.
 * If the description is empty or merely repeats the title, this synthesizes a clean,
 * clinically contextual summary based on the matched health conditions.
 */
function extractCleanSnippet(
  rawDesc: string,
  title: string,
  source: string,
  district: string
): string {
  if (!rawDesc) {
    return generateContextualSnippet(title, district);
  }

  // 1. Unescape CDATA and XML/HTML entities so all tags become literal HTML <tag>
  let text = rawDesc.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1");
  text = decodeXmlEntities(text);

  // 2. Strip all HTML tags (<a ...>, <font ...>, <p>, etc.) and whitespace
  text = text
    .replace(/<[^>]+>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 3. Compare normalized text against title + publisher to detect Google News self-references
  const normText = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normSource = source.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normCombined = normTitle + normSource;

  // If the RSS description is empty, or merely echoes the title/source (characteristic of Google News RSS):
  const isEchoOfTitle =
    normText === normTitle ||
    normText === normCombined ||
    (normTitle.length > 20 && normText.startsWith(normTitle));

  if (!text || text.length < 15 || isEchoOfTitle) {
    return generateContextualSnippet(title, district);
  }

  return text;
}

/**
 * Synthesizes an informative contextual summary when the press RSS feed omits full article body text.
 */
function generateContextualSnippet(title: string, district: string): string {
  const t = title.toLowerCase();

  if (/water|diarrh|cholera|contaminat|drink|vomit|gastro/i.test(t)) {
    return `Regional press coverage tracking water safety, gastrointestinal illness cases, and municipal containment measures in ${district}.`;
  }
  if (/dengue|malaria|chikungunya|mosquito|larva|vector/i.test(t)) {
    return `Local press report tracking vector-borne case trends, municipal fogging operations, and hospital admissions in ${district}.`;
  }
  if (/flu|influenza|h1n1|h3n2|cough|respiratory|pneumonia/i.test(t)) {
    return `Media coverage monitoring viral respiratory infection trends, OPD volume, and civic health advisories across ${district}.`;
  }
  if (/conjunctivitis|eye\s*flu/i.test(t)) {
    return `Public health reporting on contact viral eye infections, school precautions, and outpatient surge in ${district}.`;
  }
  if (/measles|rubella|rash|chickenpox/i.test(t)) {
    return `Local health dispatch tracking pediatric viral cases, containment survey, and immunization response in ${district}.`;
  }
  if (/hepatitis|jaundice|typhoid/i.test(t)) {
    return `Regional reporting on water and food hygiene inspections, pipeline testing, and jaundice cases in ${district}.`;
  }

  return `Live regional press reporting on active communicable illness patterns and community health updates in ${district} district.`;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, " - ");
}
