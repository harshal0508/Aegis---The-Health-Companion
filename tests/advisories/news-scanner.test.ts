import { describe, it, expect } from "vitest";
import {
  parseGoogleNewsRss,
  fetchLiveDistrictHealthNews,
} from "@/lib/advisories/news-scanner";

describe("Live District News Scanner & Clinical Relevance Filters", () => {
  it("exports fetchLiveDistrictHealthNews function", () => {
    expect(typeof fetchLiveDistrictHealthNews).toBe("function");
  });

  it("filters out civic scandals, animal sightings, and hospital administration rows", () => {
    const mockRssXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Snake spotted near OPD window at Indore Govt Hospital, video goes viral - Medical Dialogues</title>
            <link>https://news.google.com/articles/snake1</link>
            <pubDate>Wed, 30 Sep 2026 12:00:00 GMT</pubDate>
            <source>Medical Dialogues</source>
          </item>
          <item>
            <title>H1N1-Linked Death In Madhya Pradesh Sparks Probe At Indore Hospital - NDTV</title>
            <link>https://news.google.com/articles/h1n1-indore</link>
            <pubDate>Thu, 15 Oct 2026 10:00:00 GMT</pubDate>
            <source>NDTV</source>
          </item>
          <item>
            <title>Snake enters MY Hospital's new OPD in Indore: Spotted near window - Bhaskar English</title>
            <link>https://news.google.com/articles/snake2</link>
            <pubDate>Tue, 29 Sep 2026 08:00:00 GMT</pubDate>
            <source>Bhaskar English</source>
          </item>
          <item>
            <title>'Not a single brick laid': MP's 100-bed hospital fully functional on 'paper' for 6 years - The Times of India</title>
            <link>https://news.google.com/articles/brick-scandal</link>
            <pubDate>Sat, 04 Jul 2026 09:00:00 GMT</pubDate>
            <source>The Times of India</source>
          </item>
          <item>
            <title>Indore Police launch probe after video sparks bandage row - The Times of India</title>
            <link>https://news.google.com/articles/police-bandage</link>
            <pubDate>Mon, 27 Jul 2026 14:00:00 GMT</pubDate>
            <source>The Times of India</source>
          </item>
          <item>
            <title>Dengue cases surge in Pune as Oct heat boost mosquito breeding - The Times of India</title>
            <link>https://news.google.com/articles/dengue-pune</link>
            <pubDate>Sat, 10 Oct 2026 09:00:00 GMT</pubDate>
            <source>The Times of India</source>
          </item>
        </channel>
      </rss>
    `;

    const articles = parseGoogleNewsRss(mockRssXml, "Indore");

    // Out of 6 items, only H1N1 and Dengue should pass; 4 irrelevant civic/animal items must be blocked!
    expect(articles.length).toBe(2);

    const titles = articles.map((a) => a.title);
    expect(titles.some((t) => t.includes("H1N1"))).toBe(true);
    expect(titles.some((t) => t.includes("Dengue"))).toBe(true);

    // Verify all 4 non-disease civic items were rejected
    expect(titles.some((t) => t.includes("Snake"))).toBe(false);
    expect(titles.some((t) => t.includes("brick"))).toBe(false);
    expect(titles.some((t) => t.includes("bandage row"))).toBe(false);
  });

  it("catches any active disease outbreak spreading at the time (Eye flu, Cholera, Mystery fever, Measles)", () => {
    const mockRssXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Eye flu surge: Over 400 conjunctivitis cases reported daily across schools in Indore - Free Press Journal</title>
            <link>https://news.google.com/articles/eyeflu1</link>
            <pubDate>Thu, 29 Oct 2026 11:00:00 GMT</pubDate>
            <source>Free Press Journal</source>
            <description><![CDATA[Health department issues advisory as viral conjunctivitis cases spike in city]]></description>
          </item>
          <item>
            <title>Cholera alert in southern blocks after contaminated water supply, 25 hospitalized - The Hindu</title>
            <link>https://news.google.com/articles/cholera2</link>
            <pubDate>Wed, 28 Oct 2026 09:30:00 GMT</pubDate>
            <source>The Hindu</source>
            <description><![CDATA[Public health officials deploy chlorination teams following outbreak]]></description>
          </item>
          <item>
            <title>Mystery fever outbreak in rural belt leaves 15 children admitted - Dainik Bhaskar</title>
            <link>https://news.google.com/articles/mystery3</link>
            <pubDate>Tue, 27 Oct 2026 15:45:00 GMT</pubDate>
            <source>Dainik Bhaskar</source>
            <description><![CDATA[Medical team sent to collect blood samples as unidentified infection spreads]]></description>
          </item>
          <item>
            <title>Traffic congestion delays ambulances along MG Road - The Times of India</title>
            <link>https://news.google.com/articles/traffic4</link>
            <pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate>
            <source>The Times of India</source>
            <description><![CDATA[Traffic police deploy marshals to manage intersection gridlock]]></description>
          </item>
        </channel>
      </rss>
    `;

    const articles = parseGoogleNewsRss(mockRssXml, "Indore");

    // All 3 real clinical outbreaks (Eye flu, Cholera, Mystery fever) must be captured!
    expect(articles.length).toBe(3);

    const titles = articles.map((a) => a.title);
    expect(titles.some((t) => t.includes("Eye flu"))).toBe(true);
    expect(titles.some((t) => t.includes("Cholera"))).toBe(true);
    expect(titles.some((t) => t.includes("Mystery fever"))).toBe(true);
    // Traffic item rejected
    expect(titles.some((t) => t.includes("Traffic"))).toBe(false);

    // Verify real snippet was extracted from RSS description
    const eyeFluArticle = articles.find((a) => a.title.includes("Eye flu"));
    expect(eyeFluArticle?.snippet).toContain("Health department issues advisory");
  });

  it("handles Google News encoded HTML description without leaking raw <a> tags or URLs into snippet", () => {
    const googleNewsXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Indore water contamination: Audit report links 15 deaths to outbreak in Bhagirathpura - The Hindu</title>
            <link>https://news.google.com/rss/articles/CBMi5wFBVV95cUXPTfHxa0tOnZNqUUcOZHJNQldsVINIeXRRODB2M3REYzZId3dXNmICS1ZCW?oc=5</link>
            <pubDate>Wed, 14 Oct 2026 08:00:00 GMT</pubDate>
            <source>The Hindu</source>
            <description>&lt;a href="https://news.google.com/rss/articles/CBMi5wFBVV95cUXPTfHxa0tOnZNqUUcOZHJNQldsVINIeXRRODB2M3REYzZId3dXNmICS1ZCW?oc=5" target="_blank"&gt;Indore water contamination: Audit report links 15 deaths to outbreak in Bhagirathpura&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;The Hindu&lt;/font&gt;</description>
          </item>
          <item>
            <title>Dengue cases up 90% in district in a year - The Times of India</title>
            <link>https://news.google.com/rss/articles/CBMisAFBVV95cUxNYndxSGpjUXIwaDZ6ZEFkWG9TTG1kMGtoSU1sWThlWFgwaF9zbGNGNlFJaGw0ZUJjYjMwQjhXWTRwUVBkM21kYjl5UmJuRm54TlNRdV9Ga18tMTVFN1MyWHc3a29qVld4MXh6b2ozbVlGeDBDTlRSUTRvVTNFSlFYb01rSUJoeS1qWG9fUVRuWmp3NVNwbERCbW03dmx4bVV4RTdUTHFJSnlsUDBrQ25BNtIBtgFBVV95cUxOM21DUm?oc=5</link>
            <pubDate>Wed, 28 Oct 2026 08:00:00 GMT</pubDate>
            <source>The Times of India</source>
            <description>&lt;a href="https://news.google.com/rss/articles/..." target="_blank"&gt;Dengue cases up 90% in district in a year&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;The Times of India&lt;/font&gt;</description>
          </item>
        </channel>
      </rss>
    `;

    const articles = parseGoogleNewsRss(googleNewsXml, "Indore");
    expect(articles.length).toBe(2);

    for (const article of articles) {
      // Must not contain raw HTML tags or encoded URLs in snippet!
      expect(article.snippet).not.toContain("<a href=");
      expect(article.snippet).not.toContain("</a>");
      expect(article.snippet).not.toContain("<font");
      expect(article.snippet).not.toContain("&nbsp;");
      expect(article.snippet).not.toContain("https://");
      expect(article.snippet.length).toBeGreaterThan(20);
    }

    const waterArticle = articles.find((a) => a.title.includes("water contamination"));
    expect(waterArticle?.snippet).toContain("water safety");

    const dengueArticle = articles.find((a) => a.title.includes("Dengue"));
    expect(dengueArticle?.snippet).toContain("vector-borne");
  });

  it("filters strictly for current month (Oct 2026) and sorts in decreasing order (newest to oldest)", () => {
    const multiDateXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Dengue cases up 90% in district in a year - The Times of India</title>
            <link>https://news.google.com/articles/dengue-jan</link>
            <pubDate>Wed, 14 Jan 2026 08:00:00 GMT</pubDate>
            <source>The Times of India</source>
          </item>
          <item>
            <title>Dehydration, heatstroke cases rise in Indore - The Times of India</title>
            <link>https://news.google.com/articles/heatstroke-may</link>
            <pubDate>Fri, 15 May 2026 08:00:00 GMT</pubDate>
            <source>The Times of India</source>
          </item>
          <item>
            <title>Indore water contamination: Audit report links 15 deaths to outbreak in Bhagirathpura - The Hindu</title>
            <link>https://news.google.com/articles/water-oct1</link>
            <pubDate>Thu, 01 Oct 2026 08:00:00 GMT</pubDate>
            <source>The Hindu</source>
          </item>
          <item>
            <title>Chemical leak on road triggers health scare and respiratory alert - Indiatimes</title>
            <link>https://news.google.com/articles/leak-oct6</link>
            <pubDate>Tue, 06 Oct 2026 07:00:00 GMT</pubDate>
            <source>Indiatimes</source>
          </item>
          <item>
            <title>Pune Dengue Cases Reach 2,413 as Civic Action Rises - Urban Acres</title>
            <link>https://news.google.com/articles/dengue-oct29</link>
            <pubDate>Thu, 29 Oct 2026 08:00:00 GMT</pubDate>
            <source>Urban Acres</source>
          </item>
          <item>
            <title>PMC steps up dengue response as state cases rise 28% - The Times of India</title>
            <link>https://news.google.com/articles/dengue-oct27</link>
            <pubDate>Tue, 27 Oct 2026 08:00:00 GMT</pubDate>
            <source>The Times of India</source>
          </item>
        </channel>
      </rss>
    `;

    const articles = parseGoogleNewsRss(multiDateXml, "Indore");

    // Must strictly exclude Jan and May 2026 articles because Oct 2026 articles exist!
    expect(articles.every((a) => a.publishedAt.startsWith("2026-10"))).toBe(true);
    expect(articles.length).toBe(4);

    // Must be in strict DECREASING chronological order:
    // Oct 29 -> Oct 27 -> Oct 06 -> Oct 01
    expect(articles[0].publishedAt).toBe("2026-10-29");
    expect(articles[1].publishedAt).toBe("2026-10-27");
    expect(articles[2].publishedAt).toBe("2026-10-06");
    expect(articles[3].publishedAt).toBe("2026-10-01");
  });

  it("strictly returns empty array if XML only contains older historical months (no fallback to old news)", () => {
    const historicalXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Indore water contamination: Audit report links 15 deaths to outbreak in Bhagirathpura - The Hindu</title>
            <link>https://news.google.com/articles/old-jan</link>
            <pubDate>Wed, 14 Jan 2026 08:00:00 GMT</pubDate>
            <source>The Hindu</source>
          </item>
          <item>
            <title>Dehydration, heatstroke cases rise in Indore - The Times of India</title>
            <link>https://news.google.com/articles/old-may</link>
            <pubDate>Fri, 15 May 2026 08:00:00 GMT</pubDate>
            <source>The Times of India</source>
          </item>
        </channel>
      </rss>
    `;

    const articles = parseGoogleNewsRss(historicalXml, "Indore");
    // Must strictly return 0 items instead of leaking January/May news
    expect(articles.length).toBe(0);
  });
});
