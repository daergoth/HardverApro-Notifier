export type RegionItem = { id: number; title: string };
export type RegionMap = Record<string, RegionItem>;

export function toRegionList(src: RegionMap): RegionItem[] {
    return Object.values(src)
        .map((x) => ({ id: Number(x.id), title: String(x.title) }))
        .filter((x) => Number.isFinite(x.id) && x.title)
        .sort((a, b) => a.title.localeCompare(b.title, "hu"));
}

export function indexById(list: RegionItem[]): Record<number, RegionItem> {
    return (list || []).reduce((acc, it) => {
        acc[it.id] = it;
        return acc;
    }, {} as Record<number, RegionItem>);
}
