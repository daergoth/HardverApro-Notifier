export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const safeConcurrency = Math.max(1, Math.floor(concurrency || 1));
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = new Array(Math.min(safeConcurrency, items.length)).fill(0).map(async () => {
        while (true) {
            const index = nextIndex++;
            if (index >= items.length) {
                return;
            }

            results[index] = await mapper(items[index], index);
        }
    });

    await Promise.all(workers);
    return results;
}
