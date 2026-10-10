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
    ticks: vi.fn(async () => {}),
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

vi.mock('./supabase', () => ({ supabase: h.supabase }));
vi.mock('./combatEvents', () => ({
  emitCombatEvent: vi.fn(async () => null),
  emitCombatEventChain: vi.fn(async () => null),
  newChainId: () => 'chain',
}));
vi.mock('./endOfTurnConditions',()=>({processEndOfTurnConditions:vi.fn(async()=>{})}));
vi.mock('./buffs',()=>({processTurnTicks:h.state.ticks}));
vi.mock('./auras',()=>({evaluateAurasOnTurnEnd:vi.fn(async()=>{})}));
vi.mock('./movementGatedFeatures',()=>({resetMovementGatedFeatures:vi.fn(async()=>{})}));
vi.mock('./masteryRiders',()=>({sweepExpiredMasteryMarkers:vi.fn(async()=>{})}));
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
  h.state.ticks.mockClear();
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

describe('endEncounter character carry-over', () => {
  it.each([false,true])('carries death counters and explicit stable state (%s)', async stable => {
    h.state.respond = c => {
      if (c.table === 'combat_encounters' && opOf(c, 'select')) {
        return { data: { campaign_id: 'camp', started_at: null, round_number: 3 }, error: null };
      }
      if (c.table === 'combat_participants') {
        return { data: [{ combatant_id: 'cb1', participant_type: 'character', entity_id: 'char1' }], error: null };
      }
      if (c.table === 'combatants') {
        return { data: [{ id: 'cb1', current_hp: stable ? 0 : 4, temp_hp: null, death_save_successes: stable ? 0 : 1, death_save_failures: stable ? 0 : 2, is_stable: stable, is_dead: false, active_conditions: ['Prone'], active_buffs: [] }], error: null };
      }
      return { data: [], error: null };
    };
    const res = await endEncounter('enc');
    expect(res).toEqual({ ok: true });
    const charUpdate = h.state.calls.find(c => c.table === 'characters' && opOf(c, 'update'));
    expect(charUpdate).toBeTruthy();
    const payload = opOf(charUpdate!, 'update')!.args[0] as Record<string, unknown>;
    expect(payload.death_saves_successes).toBe(stable ? 0 : 1);
    expect(payload.death_saves_failures).toBe(stable ? 0 : 2);
    // Stable now has an explicit character field; dead still uses failure count.
    expect(payload.is_stable).toBe(stable);
    expect(payload).not.toHaveProperty('is_dead');
    expect(payload).not.toHaveProperty('death_save_successes');
    expect(payload).not.toHaveProperty('death_save_failures');
    expect(payload.current_hp).toBe(stable ? 0 : 4);
    expect(payload.active_conditions).toEqual(['Prone']);
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
 const encounterWrites=()=>h.state.calls.filter(c=>c.table==='combat_encounters'&&opOf(c,'update')&&opOf(c,'eq')?.args[1]==='guard-enc');
 function successful(c:Call):Resp {
  if(c.table==='combat_encounters')return {data:opOf(c,'update')?{psionic_turn_id:'next'}:encounter,error:null};
  return {data:actors,error:null};
 }
 it('overlapping controls share one successful advance and one set of turn effects',async()=>{
  let release!:(value:Resp)=>void;
  const held=new Promise<Resp>(resolve=>{release=resolve;});
  h.state.respond=c=>c.table==='combat_encounters'&&!opOf(c,'update')?held:successful(c);
  const first=advanceTurn('guard-enc'),second=advanceTurn('guard-enc');expect(second).toBe(first);
  release({data:encounter,error:null});
  expect(await first).toEqual({ok:true});expect(await second).toEqual({ok:true});
  expect(encounterWrites()).toHaveLength(1);
  expect(h.state.ticks.mock.calls).toHaveLength(2);
  expect(h.state.ticks).toHaveBeenNthCalledWith(1,{participantId:'p0',encounterId:'guard-enc',timing:'turn_end'});
  expect(h.state.ticks).toHaveBeenNthCalledWith(2,{participantId:'p1',encounterId:'guard-enc',timing:'turn_start'});
 });
 it.each([false,true])('logs the actual legendary refill including the lair adjustment (%s)',async inLair=>{
  h.state.respond=c=>{
   if(c.table==='combat_encounters')return {data:opOf(c,'update')?{psionic_turn_id:'next'}:{...encounter,in_lair:inLair},error:null};
   return {data:actors.map((a,n)=>({...a,legendary_actions_total:n===1?3:0,legendary_actions_remaining:n===1?1:0})),error:null};
  };
  expect(await advanceTurn('guard-enc')).toEqual({ok:true});
  expect(emitCombatEvent).toHaveBeenCalledWith(expect.objectContaining({eventType:'legendary_actions_refilled',payload:{refilled_from:1,refilled_to:inLair?4:3}}));
  const write=h.state.calls.find(c=>c.table==='combat_participants'&&opOf(c,'update')&&opOf(c,'eq')?.args[1]==='p1');
  expect(opOf(write!,'update')!.args[0]).toMatchObject({legendary_actions_remaining:inLair?4:3});
 });
 it('a later deliberate call can advance after the first finishes',async()=>{
  h.state.respond=successful;const first=advanceTurn('guard-enc');expect(await first).toEqual({ok:true});
  const later=advanceTurn('guard-enc');expect(later).not.toBe(first);expect(await later).toEqual({ok:true});expect(encounterWrites()).toHaveLength(2);
 });
 it('a failed read shares its result and releases the guard for retry',async()=>{
  h.state.respond=()=>({data:null,error:null});const first=advanceTurn('guard-enc'),second=advanceTurn('guard-enc');
  expect(second).toBe(first);expect(await first).toEqual({ok:false,reason:'Encounter not found'});
  h.state.respond=successful;expect(await advanceTurn('guard-enc')).toEqual({ok:true});
 });
 it('unexpected exceptions become a visible failure result and do not strand subsequent calls',async()=>{
  h.state.respond=()=>{throw new Error('Connection interrupted');};
  const first=advanceTurn('guard-enc'),second=advanceTurn('guard-enc');expect(second).toBe(first);
  expect(await first).toEqual({ok:false,reason:'Connection interrupted'});
  h.state.respond=successful;expect(await advanceTurn('guard-enc')).toEqual({ok:true});
 });
 it('does not block a different encounter behind an in-flight read',async()=>{
  let release!:(value:Resp)=>void;const held=new Promise<Resp>(resolve=>{release=resolve;});
  h.state.respond=c=>opOf(c,'eq')?.args[1]==='guard-enc'?held:{data:null,error:null};
  const first=advanceTurn('guard-enc');expect(await advanceTurn('other')).toEqual({ok:false,reason:'Encounter not found'});
  release({data:null,error:null});expect(await first).toEqual({ok:false,reason:'Encounter not found'});
 });
});
