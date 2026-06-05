export class SearchQueryEntity {
    constructor(
        public query?: string,
        public category?: string,
        public regionType?: "city" | "county" | "none",
        public regionId?: number,
    ) {}

    public get id(): string {
        const base = (this.query ?? "") + (this.category ?? "");

        // Treat "none" (all regions) as the default; keep backward-compatible ids.
        if (this.regionType === "none" || this.regionType == null) {
            return base;
        }

        if ((this.regionType === "city" || this.regionType === "county") && this.regionId != null) {
            return `${base}:${this.regionType}:${this.regionId}`;
        }

        // Backwards compatible id for older records without region fields
        return base;
    }

    public toString = (): string => {
        return `SearchQuery(query: ${this.query} category: ${this.category} regionType: ${this.regionType} regionId: ${this.regionId})\n`;
    }

    public equals(other: SearchQueryEntity): boolean {
        return this.query === other.query
            && this.category === other.category
            && this.regionType === other.regionType
            && this.regionId === other.regionId;
    }

}
