/**
 * checked.ts — v2.642 (audit 3.4): the one seam for database writes whose
 * errors were historically discarded (~38% of writes at audit time).
 *
 * Wrap any supabase write builder; on failure the error is logged through
 * the facade (=> telemetry + console) with structured context, and the
 * result is RETURNED so call sites can additionally branch/toast where a
 * UI exists. Success adds zero behavior and one await frame.
 *
 *   await checkedWrite('combatants.update active_buffs', { combatantId },
 *     supabase.from('combatants').update(u).eq('id', combatantId));
 *
 * `op` convention: '<table>.<verb> <what>' — stable strings, so telemetry
 * dedupe/grouping stays useful (never interpolate ids into op; ids go in
 * context).
 */
import { log } from '../log';

interface WriteResult { error: { code?: string; message: string } | null }

export async function checkedWrite<T extends WriteResult>(
  op: string,
  context: Record<string, unknown>,
  q: PromiseLike<T>,
): Promise<T> {
  let res: T;
  try {
    res = await q;
  } catch (thrown) {
    // Builders normally resolve with {error}; a genuine throw (network
    // down) must still be logged and must not escape past the caller in a
    // new shape — synthesize the standard result.
    log.error(`db write failed: ${op}`, thrown, context);
    return { error: { message: thrown instanceof Error ? thrown.message : String(thrown) } } as T;
  }
  if (res.error) {
    log.error(`db write failed: ${op}`, new Error(res.error.message), { ...context, code: res.error.code });
  }
  return res;
}
