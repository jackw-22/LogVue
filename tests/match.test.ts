import { describe, expect, it } from 'vitest'
import {
  formatLogCount,
  formatMatchCode,
  formatMatchStation
} from '../src/shared/format/match'
import { isMatchType } from '../src/shared/constants/matchTypes'

describe('formatMatchCode', () => {
  it('prefers an explicit label', () => {
    expect(formatMatchCode({ label: 'Q4', type: 'final', number: 9 })).toBe('Q4')
  })

  it('composes prefix + number from type/number', () => {
    expect(formatMatchCode({ type: 'qualification', number: 4 })).toBe('Q4')
    expect(formatMatchCode({ type: 'semifinal', number: 1 })).toBe('SF1')
    expect(formatMatchCode({ type: 'final', number: 2 })).toBe('F2')
  })

  it('falls back to "Match N" for an unknown/absent type', () => {
    expect(formatMatchCode({ number: 7 })).toBe('Match 7')
  })

  it('returns null when there is nothing to show', () => {
    expect(formatMatchCode({})).toBeNull()
    expect(formatMatchCode(null)).toBeNull()
    expect(formatMatchCode(undefined)).toBeNull()
  })

  it('ignores a blank label but keeps composing', () => {
    expect(formatMatchCode({ label: '  ', type: 'qualification', number: 4 })).toBe('Q4')
  })
})

describe('formatMatchStation', () => {
  it('capitalises alliance and joins with station', () => {
    expect(formatMatchStation({ alliance: 'blue', station: 'B2' })).toBe('Blue B2')
  })

  it('handles only one side present', () => {
    expect(formatMatchStation({ alliance: 'red' })).toBe('Red')
    expect(formatMatchStation({ station: 'B2' })).toBe('B2')
  })

  it('returns empty when nothing is set', () => {
    expect(formatMatchStation({})).toBe('')
    expect(formatMatchStation(undefined)).toBe('')
  })
})

describe('formatLogCount', () => {
  it('pluralises', () => {
    expect(formatLogCount(0)).toBe('no logs')
    expect(formatLogCount(1)).toBe('1 log')
    expect(formatLogCount(3)).toBe('3 logs')
  })
})

describe('isMatchType', () => {
  it('recognises match session types', () => {
    expect(isMatchType('official_match')).toBe(true)
    expect(isMatchType('practice_match')).toBe(true)
    expect(isMatchType('replay')).toBe(true)
    expect(isMatchType('competition_event')).toBe(false)
    expect(isMatchType('general_session')).toBe(false)
  })
})
