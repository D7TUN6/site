import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
export async function getOrder(dir) {
    try {
        const raw = await readFile(path.join(dir, '.order.json'), 'utf-8');
        const data = JSON.parse(raw);
        return Array.isArray(data.order) ? data.order : [];
    }
    catch {
        return [];
    }
}
export async function setOrder(dir, slugs) {
    await writeFile(path.join(dir, '.order.json'), JSON.stringify({ order: slugs }), 'utf-8');
}
export function applyOrder(items, dir, orderedSlugs) {
    if (orderedSlugs.length === 0)
        return items;
    const slugOrder = new Map(orderedSlugs.map((s, i) => [s, i]));
    const hasAll = items.every((item) => slugOrder.has(item.slug));
    if (!hasAll)
        return items;
    return [...items].sort((a, b) => (slugOrder.get(a.slug) ?? 0) - (slugOrder.get(b.slug) ?? 0));
}
