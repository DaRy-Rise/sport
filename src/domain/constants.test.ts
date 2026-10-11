import { describe, expect, it } from 'vitest'
import * as C from './constants'

describe('constants', () => {
  it('содержат пороги из спецификаций', () => {
    expect(C.CALIBRATION_DAYS_DEFAULT).toBe(14)
    expect(C.MIN_DAYS_FOR_REAL_TDEE).toBe(21)
    expect(C.INSIGHT_MIN_OBS_PER_GROUP).toBe(8)
    expect(C.KCAL_PER_KG).toBe(7700)
  })
})
