import Dexie, { type EntityTable } from 'dexie'
import { syncMiddleware, type Tombstone } from './sync'
import type {
  Batch, DayRecord, DiaryEntry, Exercise, Food, MealTemplate, PersonalYield, Phase, Profile,
  Program, SleepNight, Suggestion, Tare, Workout, WorkoutSet,
} from '../domain/types'

export interface SettingRow {
  key: string
  value: unknown
}

export class AppDB extends Dexie {
  profiles!: EntityTable<Profile, 'effectiveFrom'>
  phases!: EntityTable<Phase, 'id'>
  foods!: EntityTable<Food, 'id'>
  templates!: EntityTable<MealTemplate, 'id'>
  batches!: EntityTable<Batch, 'id'>
  tares!: EntityTable<Tare, 'id'>
  yields!: EntityTable<PersonalYield, 'foodId'>
  diary!: EntityTable<DiaryEntry, 'id'>
  days!: EntityTable<DayRecord, 'date'>
  exercises!: EntityTable<Exercise, 'id'>
  programs!: EntityTable<Program, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  sets!: EntityTable<WorkoutSet, 'id'>
  sleep!: EntityTable<SleepNight, 'date'>
  suggestions!: EntityTable<Suggestion, 'id'>
  settings!: EntityTable<SettingRow, 'key'>
  /** Удалённые записи — чтобы удаление дошло до других устройств. */
  tombstones!: EntityTable<Tombstone, 'id'>

  constructor(name = 'sport-tracker') {
    super(name)
    this.version(1).stores({
      profiles: 'effectiveFrom',
      phases: '++id, kind, startDate',
      foods: '++id, kind, name, fdcId, *synonyms',
      templates: '++id, name',
      batches: '++id, cookedDate, finished',
      tares: '++id',
      yields: 'foodId',
      diary: '++id, date, meal',
      days: 'date',
      exercises: '++id, name, pattern',
      programs: '++id, phase',
      workouts: '++id, date, kind',
      sets: '++id, workoutId, exerciseId, date',
      sleep: 'date',
      suggestions: '++id, kind, status',
      settings: 'key',
    })
    this.version(2).stores({ tombstones: 'id, table' })
    this.use(syncMiddleware(this))
  }
}

export { TABLE_NAMES, type TableName } from './tables'

export const SCHEMA_VERSION = 1

let instance: AppDB | null = null
export function getDB(): AppDB {
  if (!instance) instance = new AppDB()
  return instance
}
