import { stat } from 'fs/promises'

/** How often the destination file is sized while a pull is in flight. */
const POLL_MS = 200

/**
 * `adb pull` is a buffered `execFile` — it prints nothing we can stream and resolves
 * only once the whole file has landed (AdbClient.pull). But it writes the destination
 * incrementally, so sizing that file on a timer gives a real byte count, and from it
 * an honest transfer rate and ETA.
 *
 * The stat is best-effort: the file doesn't exist for the first tick or two, and a
 * failure to size it must never fail the import.
 */
export async function withPullProgress<T>(
  destPath: string,
  onBytes: (bytes: number) => void,
  run: () => Promise<T>
): Promise<T> {
  const timer = setInterval(() => {
    void stat(destPath)
      .then((s) => onBytes(s.size))
      .catch(() => {})
  }, POLL_MS)
  try {
    return await run()
  } finally {
    clearInterval(timer)
  }
}
