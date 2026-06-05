export interface SearchQuery {
    query?: string;
    category?: string;
    /**
     * Location filter type for HardverApró.
     * - "city" -> send as `stmid`
     * - "county" -> send as `stcid`
     */
    regionType?: "city" | "county" | "none";
    /**
     * Location identifier, taken from region data files (`src/data/cities.json` / `src/data/counties.json`).
     */
    regionId?: number;
}
