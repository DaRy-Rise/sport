// Начальные данные: библиотека упражнений, программы и шаблоны блюд пользователя.
import type { Exercise, Program, ProgramExercise } from './types'

export const SEED_EXERCISES: Exercise[] = [
  // Тренажёры, которыми пользуется пользователь
  { name: 'Жим ногами', muscles: 'квадрицепсы, ягодицы', pattern: 'legs', equipment: 'machine', bigStep: true },
  { name: 'Горизонтальная тяга блока', muscles: 'широчайшие, ромбовидные, бицепс', pattern: 'pull', equipment: 'machine', bigStep: true },
  { name: 'Бабочка', muscles: 'грудные', pattern: 'isolation', equipment: 'machine', bigStep: false },
  // Остальные тренажёры
  { name: 'Тяга верхнего блока', muscles: 'широчайшие, бицепс', pattern: 'pull', equipment: 'machine', bigStep: true },
  { name: 'Жим в тренажёре сидя', muscles: 'грудные, трицепс', pattern: 'push', equipment: 'machine', bigStep: false },
  { name: 'Жим вверх в тренажёре', muscles: 'дельты, трицепс', pattern: 'push', equipment: 'machine', bigStep: false },
  { name: 'Разгибание ног', muscles: 'квадрицепсы', pattern: 'isolation', equipment: 'machine', bigStep: false },
  { name: 'Сгибание ног', muscles: 'бицепс бедра', pattern: 'hinge', equipment: 'machine', bigStep: false },
  { name: 'Гиперэкстензия', muscles: 'разгибатели спины, ягодицы, бицепс бедра', pattern: 'hinge', equipment: 'bodyweight', bigStep: false },
  { name: 'Гакк-присед', muscles: 'квадрицепсы, ягодицы', pattern: 'legs', equipment: 'machine', bigStep: true },
  { name: 'Сведение/разведение бедра', muscles: 'ягодицы, приводящие', pattern: 'isolation', equipment: 'machine', bigStep: false },
  // Свободные веса
  { name: 'Присед со штангой', muscles: 'квадрицепсы, ягодицы', pattern: 'legs', equipment: 'free', bigStep: true },
  { name: 'Гоблет-присед', muscles: 'квадрицепсы, ягодицы', pattern: 'legs', equipment: 'free', bigStep: false },
  { name: 'Болгарские выпады', muscles: 'квадрицепсы, ягодицы', pattern: 'legs', equipment: 'free', bigStep: false },
  { name: 'Становая тяга', muscles: 'задняя цепь', pattern: 'hinge', equipment: 'free', bigStep: true },
  { name: 'Румынская тяга с гантелями', muscles: 'бицепс бедра, ягодицы', pattern: 'hinge', equipment: 'free', bigStep: false },
  { name: 'Румынская тяга со штангой', muscles: 'бицепс бедра, ягодицы', pattern: 'hinge', equipment: 'free', bigStep: true },
  { name: 'Ягодичный мост', muscles: 'ягодицы', pattern: 'hinge', equipment: 'free', bigStep: true },
  { name: 'Жим лёжа', muscles: 'грудные, трицепс', pattern: 'push', equipment: 'free', bigStep: false },
  { name: 'Жим гантелей лёжа', muscles: 'грудные, трицепс', pattern: 'push', equipment: 'free', bigStep: false },
  { name: 'Жим стоя', muscles: 'дельты, трицепс', pattern: 'push', equipment: 'free', bigStep: false },
  { name: 'Тяга штанги в наклоне', muscles: 'широчайшие, ромбовидные', pattern: 'pull', equipment: 'free', bigStep: true },
  { name: 'Тяга гантели в наклоне', muscles: 'широчайшие', pattern: 'pull', equipment: 'free', bigStep: false },
  { name: 'Подтягивания', muscles: 'широчайшие, бицепс', pattern: 'pull', equipment: 'bodyweight', bigStep: false },
  { name: 'Планка', muscles: 'кор', pattern: 'core', equipment: 'bodyweight', bigStep: false },
  { name: 'Скручивания', muscles: 'пресс', pattern: 'core', equipment: 'bodyweight', bigStep: false },
  { name: 'Подъём ног в висе', muscles: 'пресс', pattern: 'core', equipment: 'bodyweight', bigStep: false },
]

type Spec = [name: string, sets: number, repMin: number, repMax: number, rir: number]

function day(key: string, name: string, specs: Spec[], idOf: (name: string) => number) {
  return {
    key, name,
    exercises: specs.map(([n, sets, repMin, repMax, targetRir]): ProgramExercise => ({ exerciseId: idOf(n), sets, repMin, repMax, targetRir })),
  }
}

/** Программы по умолчанию; `idOf` отдаёт id упражнения по названию. */
export function seedPrograms(idOf: (name: string) => number): Program[] {
  return [
    {
      phase: 'weight', name: 'Этап «вес»: A/B на тренажёрах',
      days: [
        day('A', 'Тренировка A', [
          ['Жим ногами', 3, 6, 10, 2], ['Горизонтальная тяга блока', 3, 6, 10, 2], ['Жим в тренажёре сидя', 3, 6, 10, 2],
          ['Румынская тяга с гантелями', 3, 8, 10, 2], ['Планка', 3, 1, 1, 2],
        ], idOf),
        day('B', 'Тренировка B', [
          ['Гакк-присед', 3, 6, 10, 2], ['Тяга верхнего блока', 3, 6, 10, 2], ['Жим вверх в тренажёре', 3, 6, 10, 2],
          ['Ягодичный мост', 3, 8, 10, 2], ['Скручивания', 3, 10, 15, 2], ['Бабочка', 2, 10, 12, 2],
        ], idOf),
      ],
    },
    {
      phase: 'strength', name: 'Этап «сила»: 3-5 повторов',
      days: [
        day('A', 'Тренировка A', [
          ['Присед со штангой', 3, 3, 5, 2], ['Жим лёжа', 3, 3, 5, 2], ['Тяга штанги в наклоне', 3, 5, 8, 2],
          ['Румынская тяга со штангой', 3, 5, 8, 2], ['Планка', 3, 1, 1, 2],
        ], idOf),
        day('B', 'Тренировка B', [
          ['Становая тяга', 3, 3, 5, 2], ['Жим стоя', 3, 3, 5, 2], ['Подтягивания', 3, 3, 6, 2],
          ['Болгарские выпады', 3, 6, 8, 2], ['Подъём ног в висе', 3, 8, 12, 2],
        ], idOf),
      ],
    },
  ]
}
