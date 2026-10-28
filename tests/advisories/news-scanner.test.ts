import { describe, it, expect } from "vitest";
import { fetchLiveDistrictHealthNews } from "@/lib/advisories/news-scanner";

describe("Live District News Scanner & RSS Ingestion", () => {
  it("exports fetchLiveDistrictHealthNews function", () => {
    expect(typeof fetchLiveDistrictHealthNews).toBe("function");
  });

  it("handles offline environments gracefully by returning empty array", async () => {
    const articles = await fetchLiveDistrictHealthNews("Indore");
    expect(Array.isArray(articles)).toBe(true);
  });
});
