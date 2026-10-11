// Поиск по русским названиям и синонимам.

export function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}%.\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

export interface Searchable {
  name: string
  synonyms?: string[]
  brand?: string
}

/**
 * Оценка совпадения: 0 — не подходит. Все слова запроса должны встретиться
 * в названии, синонимах или производителе. Совпадение с началом названия выше.
 */
export function matchScore(item: Searchable, query: string): number {
  const q = normalize(query)
  if (!q) return 0
  const name = normalize(item.name)
  const hay = [name, ...(item.synonyms ?? []).map(normalize), normalize(item.brand ?? '')].join(' | ')
  const tokens = q.split(' ')
  if (!tokens.every((t) => hay.includes(t))) return 0
  let score = 1
  if (name.startsWith(q)) score += 3
  else if (name.includes(q)) score += 2
  else if ((item.synonyms ?? []).some((s) => normalize(s) === q)) score += 2
  // Короткие названия выше: «Гречка (сухая)» раньше «Гречка варёная с …».
  score += 1 / (1 + name.length / 20)
  return score
}

export function searchItems<T extends Searchable>(items: T[], query: string, limit = 30): T[] {
  return items
    .map((item) => ({ item, s: matchScore(item, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.item)
}
