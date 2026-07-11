import type { SessionType } from '@shared/constants/sessionTypes'

/** Icons reserved for the two container-style session categories. */
export function sessionTypeIcon(type: SessionType): string | null {
  if (type === 'competition_event') return '🏆'
  if (type === 'official_match' || type === 'practice_match' || type === 'replay') return null
  return '📁'
}
