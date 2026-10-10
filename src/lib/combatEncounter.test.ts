vi.mock('./api/endCombat',()=>({completeCombat:vi.fn()}));
import {completeCombat} from './api/endCombat';
vi.mock('./api/movementAuraReviews',()=>({pendingMovementAuraReviews:vi.fn(async()=>[])}));
// Unit tests for the v2.746 identity changes in combatEncounter.ts:
//   - seedToRow is the ONE seed → combat_participants row builder and
//     writes combatant_id explicitly (per-instance participants);
//   - startEncounter retries once, one-per-definition, when a database
//     still carrying the pre-v2.746 UNIQUE rejects the batch with 23505;
//   - endEncounter's character carry-over writes the characters table's
//     REAL column names (death_saves_*), which it never did before.
// The module imports supabase at module scope — mocked with a recording
// proxy so nothing can reach a database (unit tests never touch prod).
import { describe, expect, it, vi, beforeEach } from 'vitest';

type Op = { op: string; args: unknown[] };
type Call = { table: string; ops: Op[] };
type Resp = { data?: unknown; error?: unknown; count?: number | null };

const h = vi.hoisted(() => {
  const state = {
    endTicks: vi.fn<(...args: unknown[])=>Promise<void>>(async () => {}),
    clock:vi.fn(),recoverLive:vi.fn(),advanceLive:vi.fn(),
    calls: [] as Call[],
    respond: ((_c: Call) => ({ data: [], error: null })) as (c: Call) => Resp | Promise<Resp>,
  };
  function builder(call: Call): unknown {
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: Resp) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve().then(() => state.respond(call)).then(res, rej);
        }
        return (...args: unknown[]) => { call.ops.push({ op: String(prop), args }); return b; };
      },
    });
    return b;
  }
  return {
    state,
    supabase: {
      from(table: string) { const c: Call = { table, ops: [] }; state.calls.push(c); return builder(c); },
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  };
});

vi.mock('./supabase', () => ({ supabase: h.supabase,getCurrentUserId:async()=> 'dm' }));
vi.mock('./api/liveTurnTransitions',()=>({withCurrentTurnUser:(work:(user:string,guard:()=>void)=>Promise<unknown>)=>work('dm',()=>{}),recoverLiveTurnTransition:h.state.recoverLive,advanceLiveTurnTransition:h.state.advanceLive}));
vi.mock('./api/combatClock',()=>({getCombatClockContext:h.state.clock}));
vi.mock('./combatEvents', () => ({
  emitCombatEvent: vi.fn(async () => null),
  emitCombatEventChain: vi.fn(async () => null),
  newChainId: () => 'chain',
}));
vi.mock('./endOfTurnConditions',()=>({processEndOfTurnConditions:vi.fn(async()=>{})}));
vi.mock('./api/turnEffects',()=>({processSavedTurnEffects:h.state.endTicks}));
vi.mock('./auras',()=>({evaluateAurasOnTurnEnd:vi.fn(async()=>{})}));
vi.mock('./movementGatedFeatures',()=>({resetMovementGatedFeatures:vi.fn(async()=>{})}));
vi.mock('./masteryRiders',()=>({sweepExpiredMasteryMarkers:vi.fn(async()=>{}),sweepEndedMasteryMarkers:vi.fn(async()=>{})}));
vi.mock('./api/checked', () => ({ checkedWrite: vi.fn(async () => ({ error: null })) }));

import { emitCombatEvent } from './combatEvents';
import { recoverInitiativeResources } from './initiativeResources';
vi.mock('./initiativeResources',()=>({recoverInitiativeResources:vi.fn(async()=>{})}));
import { advanceTurn, characterToSeed, seedToRow, firstPerDefinition, startEncounter, endEncounter, addParticipantToEncounter, rollInitiativeForParticipant, type SeedSource } from './combatEncounter';

const seed = (over: Partial<SeedSource>): SeedSource => ({
  type: 'creature', entityId: 'goblin-def', name: 'Goblin Scout',
  ac: 13, hp: 7, maxHp: 7, dexMod: 2, initiativeBonus: 0, ...over,
});
const ctx = { encounterId: 'enc', campaignId: 'camp', initiativeMode: 'auto_all' as const, turnOrder: 0 };
const opOf = (c: Call, name: string) => c.ops.find(o => o.op === name);

beforeEach(() => {
  vi.mocked(recoverInitiativeResources).mockClear();
  h.state.recoverLive.mockReset().mockResolvedValue(false);h.state.advanceLive.mockReset().mockResolvedValue(undefined);
  h.state.clock.mockReset().mockResolvedValue({outgoingId:'p0',incomingId:'p1',nextIndex:1,nextRound:1,roundWrapped:false});
  h.state.endTicks.mockReset().mockResolvedValue();
  vi.mocked(emitCombatEvent).mockClear();
  h.state.calls.length = 0;
  h.state.respond = () => ({ data: [], error: null });
});

describe('seedToRow', () => {
  it('writes combatant_id when the seed carries one and null otherwise', () => {
    expect(seedToRow(seed({ combatantId: 'cb-1' }), ctx).combatant_id).toBe('cb-1');
    expect(seedToRow(seed({}), ctx).combatant_id).toBeNull();
    expect(seedToRow(seed({ combatantId: null }), ctx).combatant_id).toBeNull();
  });

  it('keeps entity_id as the definition id and normalizes legacy types', () => {
    const row = seedToRow(seed({ type: 'monster', attacksPerAction: 2 }), { ...ctx, turnOrder: 999 });
    expect(row.entity_id).toBe('goblin-def');
    expect(row.participant_type).toBe('creature');
    expect(row.turn_order).toBe(999);
    expect(row.attacks_per_action).toBe(2);
    expect(row.attacks_remaining).toBe(2);
  });

  it('leaves a hidden monster unrolled unless roll_at_start', () => {
    expect(seedToRow(seed({ hiddenFromPlayers: true }), ctx).initiative).toBeNull();
    expect(seedToRow(seed({ hiddenFromPlayers: true }), { ...ctx, hiddenMonsterRevealMode: 'roll_at_start' }).initiative)
      .toBeTypeOf('number');
  });
});

describe('firstPerDefinition', () => {
  it('keeps the first seed per (type, entityId) with its combatantId', () => {
    const out = firstPerDefinition([
      seed({ combatantId: 'a', name: 'Goblin A' }),
      seed({ combatantId: 'b', name: 'Goblin B' }),
      seed({ type: 'character', entityId: 'pc', combatantId: 'c' }),
    ]);
    expect(out.map(s => s.combatantId)).toEqual(['a', 'c']);
  });
});

describe('startEncounter 23505 fallback', () => {
  const encounterRow = { id: 'enc', campaign_id: 'camp', status: 'active' };

  it('retries ONCE with one-per-definition rows when the legacy UNIQUE rejects the batch', async () => {
    let participantInserts = 0;
    h.state.respond = c => {
      if (c.table === 'combat_encounters') return { data: encounterRow, error: null };
      if (c.table === 'combat_participants' && opOf(c, 'insert')) {
        participantInserts += 1;
        if (participantInserts === 1) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const rows = (opOf(c, 'insert')!.args[0] as Array<Record<string, unknown>>);
        return { data: rows.map((r, i) => ({ ...r, id: `p${i}` })), error: null };
      }
      return { data: [], error: null };
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await startEncounter({
      campaignId: 'camp', initiativeMode: 'auto_all',
      seeds: [seed({ combatantId: 'a' }), seed({ combatantId: 'b' }), seed({ combatantId: 'c' })],
    });
    warn.mockRestore();
    expect(participantInserts).toBe(2);
    const inserts = h.state.calls.filter(c => c.table === 'combat_participants' && opOf(c, 'insert'));
    expect((opOf(inserts[0], 'insert')!.args[0] as unknown[]).length).toBe(3);
    const retryRows = opOf(inserts[1], 'insert')!.args[0] as Array<{ combatant_id: string | null }>;
    expect(retryRows.length).toBe(1);
    expect(retryRows[0].combatant_id).toBe('a');
    expect(res?.participants.length).toBe(1);
  });

  it('does not retry on any other error', async () => {
    let participantInserts = 0;
    h.state.respond = c => {
      if (c.table === 'combat_encounters') return { data: encounterRow, error: null };
      if (c.table === 'combat_participants' && opOf(c, 'insert')) {
        participantInserts += 1;
        return { data: null, error: { code: '42501', message: 'permission denied' } };
      }
      return { data: [], error: null };
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await startEncounter({ campaignId: 'camp', initiativeMode: 'auto_all', seeds: [seed({ combatantId: 'a' })] });
    err.mockRestore();
    expect(participantInserts).toBe(1);
    expect(res?.participants).toEqual([]);
  });
});

describe('atomic encounter completion',()=>{
 it('delegates carry-over without browser writes',async()=>{
  vi.mocked(completeCombat).mockResolvedValueOnce({} as never);
  expect(await endEncounter('enc')).toEqual({ok:true});
  expect(completeCombat).toHaveBeenCalledWith('enc');expect(h.state.calls).toEqual([]);
  expect(emitCombatEvent).not.toHaveBeenCalled();
 });
 it('reports a failed save instead of claiming combat ended',async()=>{
  vi.mocked(completeCombat).mockRejectedValueOnce(new Error('Review pending movement'));
  expect(await endEncounter('enc')).toEqual({ok:false,reason:'Review pending movement'});
 });
});

describe('initiative resource recovery entry points',()=>{
 const part={id:'pc',entity_id:'hero',participant_type:'character',campaign_id:'camp',encounter_id:'enc',name:'Psion',initiative:12};
 it.each(['auto_all','player_agency'] as const)('combat start only recovers rolled participants (%s)',async(mode)=>{
  h.state.respond=c=>{
   if(c.table==='combat_encounters')return {data:{id:'enc',campaign_id:'camp'}};
   if(c.table==='combat_participants'&&opOf(c,'insert'))return {data:[{...part,initiative:mode==='auto_all'?12:null}]};
   return {data:[]};
  };
  await startEncounter({campaignId:'camp',initiativeMode:mode,seeds:[seed({type:'character',entityId:'hero'})]});
  expect(recoverInitiativeResources).toHaveBeenCalledTimes(mode==='auto_all'?1:0);
 });
 it.each(['auto_all','player_agency'] as const)('late participants recover only on actual rolls (%s)',async(mode)=>{
  h.state.respond=c=>c.table==='combat_participants'&&opOf(c,'insert')?{data:{...part,initiative:mode==='auto_all'?12:null}}:{data:[]};
  await addParticipantToEncounter('enc','camp',seed({type:'character',entityId:'hero'}),mode);
  expect(recoverInitiativeResources).toHaveBeenCalledTimes(mode==='auto_all'?1:0);
 });
 it('explicit roll recovers only after successful participant update',async()=>{
  h.state.respond=c=>c.table==='combat_participants'&&opOf(c,'update')?{data:part}:{data:[]};
  await rollInitiativeForParticipant('pc',2);
  expect(recoverInitiativeResources).toHaveBeenCalledWith(part);
  vi.mocked(recoverInitiativeResources).mockClear();
  h.state.respond=()=>({data:null});
  expect(await rollInitiativeForParticipant('pc',2)).toBeNull();
  expect(recoverInitiativeResources).not.toHaveBeenCalled();
 });
});

// v2.762 — regression for the nonexistent `class` field in encounter seeding.
it.each([
  ['Psion', 6, 'Metamorph', 2],
  ['Psion', 20, 'Telepath', 1],
  ['Fighter', 11, null, 3],
  ['Monk', 5, null, 2],
] as const)('seeds %s %i attack count into both encounter counters', (class_name, level, subclass, count) => {
  const character = {id:'pc',name:'Fixture',class_name,level,subclass} as import('../types').Character;
  const row = seedToRow(characterToSeed(character), ctx);
  expect(row.attacks_per_action).toBe(count);
  expect(row.attacks_remaining).toBe(count);
});

describe('shared live turn advancement',()=>{
 const encounter={id:'guard-enc',campaign_id:'camp',status:'active',current_turn_index:0,round_number:1,psionic_turn_id:'turn'};
 const actors=[0,1].map(n=>({id:`p${n}`,combatant_id:`cb${n}`,campaign_id:'camp',name:`Actor ${n}`,participant_type:'creature',turn_order:n,current_hp:10,max_hp:10,is_dead:false}));
 function successful(c:Call):Resp{return {data:c.table==='combat_encounters'?encounter:actors,error:null};}
 it('overlapping controls share one atomic transition and one set of outgoing effects',async()=>{
  let release!:(value:Resp)=>void;const held=new Promise<Resp>(resolve=>{release=resolve;});
  h.state.respond=c=>c.table==='combat_encounters'?held:successful(c);
  const first=advanceTurn('guard-enc'),second=advanceTurn('guard-enc');expect(second).toBe(first);release({data:encounter,error:null});
  expect(await first).toEqual({ok:true});expect(h.state.advanceLive).toHaveBeenCalledTimes(1);
  expect(h.state.advanceLive).toHaveBeenCalledWith('dm','guard-enc','turn',expect.any(Function));
  expect(h.state.endTicks).toHaveBeenCalledOnce();expect(h.state.calls.some(c=>opOf(c,'update'))).toBe(false);
 });
 it('recovers unfinished incoming work before reading or processing a fresh outgoing turn',async()=>{
  h.state.recoverLive.mockResolvedValue(true);expect(await advanceTurn('guard-enc')).toEqual({ok:true});
  expect(h.state.calls).toEqual([]);expect(h.state.endTicks).not.toHaveBeenCalled();expect(h.state.advanceLive).not.toHaveBeenCalled();
 });
 it('postponed movement review stops all new outgoing effects',async()=>{
  const review=vi.fn(async()=>{throw new Error('Movement postponed');});
  expect(await advanceTurn('guard-enc',undefined,review)).toEqual({ok:false,reason:'Movement postponed'});
  expect(review).toHaveBeenCalledOnce();expect(h.state.calls).toEqual([]);expect(h.state.endTicks).not.toHaveBeenCalled();expect(h.state.advanceLive).not.toHaveBeenCalled();
 });
 it('committed incoming recovery does not start movement review for the new turn',async()=>{
  const review=vi.fn();h.state.recoverLive.mockResolvedValue(true);
  expect(await advanceTurn('guard-enc',undefined,review)).toEqual({ok:true});expect(review).not.toHaveBeenCalled();
 });
 it('uses the recorded outgoing actor after lethal tick damage compresses the roster',async()=>{
  h.state.respond=c=>c.table==='combat_encounters'?successful(c):{data:actors.map((a,n)=>({...a,is_dead:n===0})),error:null};
  h.state.clock.mockResolvedValue({outgoingId:'p0',incomingId:'p1',nextIndex:0,nextRound:1,roundWrapped:false});
  expect(await advanceTurn('guard-enc')).toEqual({ok:true});expect(h.state.endTicks).toHaveBeenCalledWith('dm',expect.objectContaining({participantId:'p0',turnId:'turn'}),expect.any(Function));expect(h.state.advanceLive).toHaveBeenCalledOnce();
 });
 it('unconfirmed outgoing ticks stop before the clock transaction and retry the same identity',async()=>{
  h.state.respond=successful;h.state.endTicks.mockRejectedValueOnce(new Error('Reply lost'));
  expect(await advanceTurn('guard-enc')).toEqual({ok:false,reason:'Reply lost'});expect(h.state.advanceLive).not.toHaveBeenCalled();
  expect(await advanceTurn('guard-enc')).toEqual({ok:true});expect(h.state.endTicks.mock.calls[0][1]).toEqual(h.state.endTicks.mock.calls[1][1]);
 });
 it('a recovery failure cannot begin a new outgoing phase',async()=>{
  h.state.recoverLive.mockRejectedValue(new Error('Incoming save needs review'));
  expect(await advanceTurn('guard-enc')).toEqual({ok:false,reason:'Incoming save needs review'});expect(h.state.calls).toEqual([]);expect(h.state.endTicks).not.toHaveBeenCalled();
 });
 it('a later deliberate call can advance after the first finishes',async()=>{
  h.state.respond=successful;const first=advanceTurn('guard-enc');expect(await first).toEqual({ok:true});
  const later=advanceTurn('guard-enc');expect(later).not.toBe(first);expect(await later).toEqual({ok:true});expect(h.state.advanceLive).toHaveBeenCalledTimes(2);
 });
 it('a failed read shares its result and releases the guard for retry',async()=>{
  h.state.respond=()=>({data:null,error:null});const first=advanceTurn('guard-enc'),second=advanceTurn('guard-enc');
  expect(second).toBe(first);expect(await first).toEqual({ok:false,reason:'Encounter not found'});h.state.respond=successful;expect(await advanceTurn('guard-enc')).toEqual({ok:true});
 });
 it('unexpected exceptions become a failure result without stranding subsequent calls',async()=>{
  h.state.respond=()=>{throw new Error('Connection interrupted');};expect(await advanceTurn('guard-enc')).toEqual({ok:false,reason:'Connection interrupted'});
  h.state.respond=successful;expect(await advanceTurn('guard-enc')).toEqual({ok:true});
 });
});
