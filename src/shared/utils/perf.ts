/**
 * Utilidad de instrumentación ligera para medición de rendimiento en desarrollo.
 * Es un no-op estricto cuando import.meta.env.DEV es falso.
 */

interface PerfEntry {
  label: string;
  durationMs: number;
}

const isDev = Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV);

const startTimes = new Map<string, number>();
const entries: PerfEntry[] = [];
const counters = new Map<string, number>();

export function perfStart(label: string): void {
  if (!isDev) return;
  startTimes.set(label, performance.now());
}

export function perfEnd(label: string): number | undefined {
  if (!isDev) return undefined;
  const start = startTimes.get(label);
  if (start === undefined) return undefined;
  const durationMs = Number((performance.now() - start).toFixed(2));
  startTimes.delete(label);
  entries.push({ label, durationMs });
  return durationMs;
}

export function perfCount(label: string, delta = 1): void {
  if (!isDev) return;
  counters.set(label, (counters.get(label) || 0) + delta);
}

export function perfReset(): void {
  if (!isDev) return;
  startTimes.clear();
  entries.length = 0;
  counters.clear();
}

export function perfReport(): void {
  if (!isDev) return;
  if (entries.length === 0 && counters.size === 0) {
    console.log('[PERF] Sin métricas para reportar.');
    return;
  }

  console.group('[PERF REPORT - RENDIMIENTO]');
  if (entries.length > 0) {
    console.table(
      entries.map(e => ({
        Operación: e.label,
        'Duración (ms)': e.durationMs,
      }))
    );
  }

  if (counters.size > 0) {
    const counts: Array<{ Contador: string; Total: number }> = [];
    counters.forEach((val, key) => counts.push({ Contador: key, Total: val }));
    console.table(counts);
  }
  console.groupEnd();
}
