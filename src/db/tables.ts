// Список таблиц отдельно от схемы, чтобы его могли импортировать и схема, и синхронизация.
/** Таблицы, входящие в резервную копию (все). */
export const TABLE_NAMES = [
  'profiles', 'phases', 'foods', 'templates', 'batches', 'tares', 'yields', 'diary', 'days',
  'exercises', 'programs', 'workouts', 'sets', 'sleep', 'suggestions', 'settings',
] as const
export type TableName = (typeof TABLE_NAMES)[number]
