import { describe, expect, it } from 'vitest'
import {
  matchNumberFor,
  normalizeEvent,
  normalizeSearchEvent,
  replayNumberFor,
  toLabel,
  toLocalMatchType
} from '../src/main/services/ftcscout/FtcScoutClient'

function teamMatch(match: { tournamentLevel: string; series: number; matchNum: number; id: number }) {
  return {
    teamNumber: 11148,
    alliance: 'Blue',
    station: 'Two',
    surrogate: false,
    noShow: false,
    dq: false,
    onField: true,
    match: {
      id: match.id,
      season: 2025,
      eventCode: 'AUSYOS',
      tournamentLevel: match.tournamentLevel,
      series: match.series,
      matchNum: match.matchNum,
      description: `M-${match.series}`,
      scheduledStartTime: null,
      actualStartTime: null,
      hasBeenPlayed: true
    }
  }
}

describe('FTCScout normalization', () => {
  it('keeps only the archive team matches and normalizes station/match fields', () => {
    const event = normalizeEvent(
      {
        season: 2026,
        code: 'apoc',
        name: 'APOC',
        timezone: 'Australia/Sydney',
        start: '2026-07-04',
        end: '2026-07-05',
        hasMatches: true,
        teamMatches: [
          {
            teamNumber: 12345,
            alliance: 'Blue',
            station: 'Two',
            surrogate: false,
            noShow: false,
            dq: false,
            onField: true,
            match: {
              id: 1004,
              season: 2026,
              eventCode: 'apoc',
              tournamentLevel: 'Quals',
              series: 1,
              matchNum: 4,
              description: 'Qualification 4',
              scheduledStartTime: '2026-07-04T01:00:00.000Z',
              actualStartTime: null,
              hasBeenPlayed: false
            }
          },
          {
            teamNumber: 99999,
            alliance: 'Red',
            station: 'One',
            surrogate: false,
            noShow: false,
            dq: false,
            onField: true,
            match: {
              id: 1005,
              season: 2026,
              eventCode: 'apoc',
              tournamentLevel: 'Quals',
              series: 1,
              matchNum: 5,
              description: 'Qualification 5',
              scheduledStartTime: null,
              actualStartTime: null,
              hasBeenPlayed: false
            }
          }
        ]
      },
      12345,
      new Date('2026-07-04T00:00:00.000Z')
    )

    expect(event.code).toBe('APOC')
    expect(event.matches).toHaveLength(1)
    expect(event.matches[0].match).toMatchObject({
      source: 'ftcscout',
      label: 'Q4',
      type: 'qualification',
      number: 4,
      alliance: 'blue',
      station: 'B2',
      team_number: 12345,
      ftcscout_id: 1004
    })
  })

  it('maps released playoff levels into stable labels', () => {
    expect(toLocalMatchType('Quals')).toBe('qualification')
    expect(toLocalMatchType('Semis')).toBe('semifinal')
    expect(toLocalMatchType('Finals')).toBe('final')
    expect(toLocalMatchType('DoubleElim')).toBe('playoff')
    expect(toLabel('Semis', 2, 1)).toBe('SF2-1')
    expect(toLabel('Finals', 1, 2)).toBe('F2')
    expect(toLabel('DoubleElim', 3, 1)).toBe('DE3')
    expect(toLabel('DoubleElim', 14, 2)).toBe('DE14.2')
  })

  it('numbers a double-elim match by its bracket position, not its replay count', () => {
    // FTCScout describes this row as "M-5": series is the bracket match, matchNum
    // is the replay counter. Numbering it 1 made every DE match look like match 1.
    expect(matchNumberFor('DoubleElim', 5, 1)).toBe(5)
    expect(replayNumberFor('DoubleElim', 1)).toBeNull()

    // A replayed M-14, described as "M-14.2".
    expect(matchNumberFor('DoubleElim', 14, 2)).toBe(14)
    expect(replayNumberFor('DoubleElim', 2)).toBe(2)

    // Every other level keeps numbering by matchNum, with series as the round.
    expect(matchNumberFor('Quals', 1, 42)).toBe(42)
    expect(matchNumberFor('Semis', 2, 3)).toBe(3)
    expect(replayNumberFor('Semis', 3)).toBeNull()
  })

  it('carries the bracket number and replay through to the persisted match block', () => {
    const event = normalizeEvent(
      {
        season: 2025,
        code: 'AUSYOS',
        name: 'APOC',
        hasMatches: true,
        teamMatches: [
          teamMatch({ tournamentLevel: 'DoubleElim', series: 5, matchNum: 1, id: 25001 }),
          teamMatch({ tournamentLevel: 'DoubleElim', series: 14, matchNum: 2, id: 34002 })
        ]
      },
      11148
    )

    expect(event.matches[0].match).toMatchObject({ label: 'DE5', type: 'playoff', number: 5 })
    expect(event.matches[0].match.replay).toBeUndefined()
    expect(event.matches[1].match).toMatchObject({ label: 'DE14.2', number: 14, replay: 2 })
  })

  it('normalizes event search rows for the add-session dialog', () => {
    expect(
      normalizeSearchEvent({
        season: 2025,
        code: 'ustxcmp',
        name: 'Texas Championship',
        type: 'Championship',
        start: '2026-02-28',
        end: '2026-02-28',
        timezone: 'America/Chicago',
        hasMatches: true,
        location: { city: 'Flower Mound', state: 'TX', country: 'USA' },
        teams: [{ teamNumber: 12345 }]
      })
    ).toMatchObject({
      season: 2025,
      code: 'USTXCMP',
      name: 'Texas Championship',
      locationLabel: 'Flower Mound, TX, USA',
      hasMatches: true
    })
  })
})
