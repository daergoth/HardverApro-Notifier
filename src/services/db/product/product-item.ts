export class ProductItemEntity {
    constructor(
        public image: string,
        public title: string,
        public link: string,
        public price: string,
        public region?: string,
    ) {}

    public toString = (): string => {
        return `ProductItem(image: ${this.image} title: ${this.title} link:${this.link} price:${this.price} region:${this.region || ""})\n`;
    }

    public equals(other: ProductItemEntity): boolean {
        if (!other) {
            return false;
        }

        // Image URLs often change due to CDN/caching/resizing without any meaningful content change.
        // Deduping and change detection should be based on stable identity + user-visible fields.
        return ProductItemEntity.normalizeLink(this.link) === ProductItemEntity.normalizeLink(other.link)
            && ProductItemEntity.normalizeText(this.title) === ProductItemEntity.normalizeText(other.title)
            && ProductItemEntity.normalizeText(this.price) === ProductItemEntity.normalizeText(other.price);
    }

    public static normalizeText(input: string): string {
        return String(input || "")
            // Convert NBSP to normal space
            .replace(/\u00a0/g, " ")
            // Collapse whitespace
            .replace(/\s+/g, " ")
            .trim();
    }

    public static normalizeLink(input: string): string {
        const raw = String(input || "").trim();
        if (!raw) {
            return "";
        }

        // Make URL absolute-ish first (handle // and / links)
        let absolute = raw;
        if (absolute.startsWith("//")) {
            absolute = `https:${absolute}`;
        } else if (absolute.startsWith("/")) {
            absolute = `https://hardverapro.hu${absolute}`;
        }

        try {
            const url = new URL(absolute);
            url.hash = "";

            // Hardverapro links are stable in the path; query params are typically tracking/sorting.
            if (url.hostname.endsWith("hardverapro.hu")) {
                url.search = "";
            }

            // Normalize hostname + strip trailing slash
            url.hostname = url.hostname.toLowerCase();
            let normalized = url.toString();
            if (normalized.endsWith("/")) {
                normalized = normalized.slice(0, -1);
            }
            return normalized;
        } catch {
            // Fallback: best-effort normalization
            return absolute.replace(/\s+/g, "").replace(/#.*$/, "");
        }
    }
}
