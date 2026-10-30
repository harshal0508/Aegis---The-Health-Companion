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

// Comprehensive whitelist: Matches any infectious disease, seasonal outbreak, surge, epidemic, or public health alert
const COMMUNICABLE_DISEASE_REGEX =
  /\b(outbreak|epidemic|cases\s+surge|cases\s+rise|cases\s+spike|spurt|surge|spread|spreading|infection|infections|health\s+alert|public\s+health|hospitalized|patients\s+flood|advisory|dengue|malaria|chikungunya|h1n1|swine\s+flu|flu|influenza|viral|fever|cholera|typhoid|jaundice|hepatitis|measles|chickenpox|zika|nipah|leptospirosis|scrub\s+typhus|conjunctivitis|eye\s+flu|gastroenteritis|diarrhea|diarrhoea|food\s+poisoning|pneumonia|rsv|hfmd|hand\s+foot|respiratory|strep|pertussis|rabies|tuberculosis|tb|norovirus|rotavirus|mystery\s+(illness|fever|disease))\b/i;

// Strict blacklist: Eliminate hospital administrative scandals, animal sightings, police/crime, political or sports news
const IRRELEVANT_CIVIC_REGEX =
  /\b(snake|animal|leopard|dog|accident|crash|police|murder|theft|scam|corruption|brick|tender|stretcher|bribe|fire|arrest|fraud|protest|assault|dowry|bandage\s+row|traffic|cricket|ipl|movie|film|box\s+office|election|vote|rally|bjp|congress|aap)\b/i;

/**
 * Fetch and parse real news articles for a specific district and disease query.
 */
export async function fetchLiveDistrictHealthNews(
  district: string
): Promise<DistrictNewsArticle[]> {
  try {
    const cleanDistrict = (district || "Indore").trim();
    // Dynamic, wide-spectrum query to capture ANY active disease outbreak, epidemic, or surge spreading at this time
    const query = encodeURIComponent(
      `"${cleanDistrict}" (outbreak OR epidemic OR "cases surge" OR "cases rise" OR "cases spike" OR "health alert" OR "illness spreading" OR "infection surge" OR "viral fever" OR "eye flu" OR conjunctivitis OR dengue OR malaria OR chikungunya OR flu OR influenza OR H1N1 OR cholera OR typhoid OR jaundice OR hepatitis OR measles OR "scrub typhus" OR "food poisoning" OR "mystery fever" OR "infection")`
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

  while ((match = itemRegex.exec(xml)) !== null && articles.length < 8) {
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
      articles.push({
        id: `news-${articles.length}-${Buffer.from(rawTitle.slice(0, 20)).toString("hex")}`,
        title: decodeXmlEntities(rawTitle),
        source: decodeXmlEntities(source),
        url,
        publishedAt,
        snippet,
        district,
      });
    }
  }

  return articles;
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
