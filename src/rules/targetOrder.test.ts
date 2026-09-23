// v2.746.0 — targetOrder is the single home for "who goes where" in every
// target picker; these cases pin the rules the nine pickers rely on.
import { describe, expect, it } from 'vitest';
import {
  AUTO_SELECT_GROUPS,
  HEAL_GROUP_ORDER,
  TARGET_GROUP_ORDER,
  autoSelectIds,
  compareRanked,
  groupRanked,
  isDead,
  isDown,
  isHostileTo,
  rankTargets,
  sideOf,
  targetGroup,
  type TargetLike,
} from './targetOrder';

const pc = (id: string, over: Partial<TargetLike> = {}): TargetLike =>
  ({ id, name: id, participant_type: 'character', current_hp: 10, max_hp: 10, is_dead: false, ...over });
const mon = (id: string, over: Partial<TargetLike> = {}): TargetLike =>
  ({ id, name: id, participant_type: 'creature', current_hp: 7, max_hp: 7, is_dead: false, ...over });

describe('sides and hostility', () => {
  it('sideOf uses the participantType compat layer (legacy monster/npc are creatures)', () => {
    expect(sideOf({ participant_type: 'character' })).toBe('characters');
    expect(sideOf({ participant_type: 'creature' })).toBe('creatures');
    expect(sideOf({ participant_type: 'monster' })).toBe('creatures');
    expect(sideOf({ participant_type: 'npc' })).toBe('creatures');
  });
  it('isHostileTo is symmetric across sides and false within a side', () => {
    expect(isHostileTo(pc('a'), mon('m'))).toBe(true);
    expect(isHostileTo(mon('m'), pc('a'))).toBe(true);
    expect(isHostileTo(pc('a'), pc('b'))).toBe(false);
    expect(isHostileTo(mon('m'), mon('n'))).toBe(false);
  });
});

describe('down / dead', () => {
  it('isDead only trusts the is_dead flag — a 0-HP monster with is_dead=false is NOT dead (SRD: GM may treat a monster like a character)', () => {
    expect(isDead(mon('m', { current_hp: 0 }))).toBe(false);
    expect(isDead(mon('m', { current_hp: 0, is_dead: true }))).toBe(true);
    expect(isDead(mon('m', { current_hp: 7, is_dead: true }))).toBe(true);
  });
  it('isDown is 0 HP or dead; unknown (null) HP is not down', () => {
    expect(isDown(pc('a', { current_hp: 0 }))).toBe(true);
    expect(isDown(pc('a', { current_hp: -3 }))).toBe(true);
    expect(isDown(pc('a', { current_hp: 5, is_dead: true }))).toBe(true);
    expect(isDown(pc('a', { current_hp: null }))).toBe(false);
    expect(isDown(pc('a', { current_hp: 1 }))).toBe(false);
  });
  it('targetGroup precedence: dead > down > self > side', () => {
    const me = pc('me');
    expect(targetGroup(mon('m', { is_dead: true, current_hp: 0 }), me)).toBe('dead');
    expect(targetGroup(mon('m', { current_hp: 0 }), me)).toBe('down');
    expect(targetGroup(pc('me', { current_hp: 0 }), me)).toBe('down');
    expect(targetGroup(pc('me'), me)).toBe('self');
    expect(targetGroup(mon('m'), me)).toBe('hostile');
    expect(targetGroup(pc('b'), me)).toBe('ally');
  });
});

describe('rankTargets', () => {
  it('drops the actor unless allowSelfTarget, and never drops down or dead targets', () => {
    const list = [pc('me'), mon('dead', { is_dead: true, current_hp: 0 }), mon('down', { current_hp: 0 }), mon('live')];
    expect(rankTargets(list, { self: { id: 'me' } }).map(r => r.target.id)).toEqual(['live', 'down', 'dead']);
    expect(rankTargets(list, { self: { id: 'me' }, allowSelfTarget: true }).map(r => r.target.id))
      .toEqual(['live', 'me', 'down', 'dead']);
  });
  it('v2.746 — an actor filtered out of the list MUST bring its participant_type, or every living row reads as hostile', () => {
    // The regression the two spell pickers hit: caster removed from the
    // list, id-only self → the nearer ally outranked the enemies and the
    // section over the party read "Enemies".
    const list = [pc('nyx'), mon('goblin'), mon('goblin-dead', { is_dead: true, current_hp: 0 })];
    const dist: Record<string, number> = { nyx: 5, goblin: 80, 'goblin-dead': 10 };
    const bare = rankTargets(list, { self: { id: 'ilyana' }, distanceFt: t => dist[t.id] });
    expect(bare.map(r => [r.target.id, r.group])).toEqual([['nyx', 'hostile'], ['goblin', 'hostile'], ['goblin-dead', 'dead']]);
    const sided = rankTargets(list, { self: { id: 'ilyana', participant_type: 'character' }, distanceFt: t => dist[t.id] });
    expect(sided.map(r => [r.target.id, r.group])).toEqual([['goblin', 'hostile'], ['nyx', 'ally'], ['goblin-dead', 'dead']]);
  });
  it('orders living enemies first, then allies, with 0-HP and dead at the bottom', () => {
    const list = [
      pc('ally-down', { current_hp: 0 }),
      mon('goblin-dead', { is_dead: true, current_hp: 0 }),
      pc('ally'),
      mon('goblin-down', { current_hp: 0 }),
      mon('goblin'),
    ];
    const ids = rankTargets(list, { self: pc('me') }).map(r => r.target.id);
    expect(ids).toEqual(['goblin', 'ally', 'ally-down', 'goblin-down', 'goblin-dead']);
  });
  it('within a group: in range before out of range, then nearest first, unknown distance last, then name', () => {
    const list = [mon('far'), mon('unknown'), mon('near'), mon('b-mid'), mon('a-mid')];
    const dist: Record<string, number | null> = { far: 60, unknown: null, near: 5, 'b-mid': 30, 'a-mid': 30 };
    const ranked = rankTargets(list, { self: pc('me'), distanceFt: t => dist[t.id], maxRangeFt: 30 });
    expect(ranked.map(r => r.target.id)).toEqual(['near', 'a-mid', 'b-mid', 'unknown', 'far']);
    expect(ranked.find(r => r.target.id === 'far')!.inRange).toBe(false);
    expect(ranked.find(r => r.target.id === 'unknown')!.inRange).toBe(true);
    expect(ranked.find(r => r.target.id === 'unknown')!.rangeKnown).toBe(false);
  });
  it('fails open: no maxRangeFt or no distance callback → everything inRange, rangeKnown=false', () => {
    const ranked = rankTargets([mon('a'), mon('b')], { self: pc('me'), distanceFt: () => 999 });
    expect(ranked.every(r => r.inRange && !r.rangeKnown)).toBe(true);
    const noMap = rankTargets([mon('a')], { self: pc('me'), maxRangeFt: 5 });
    expect(noMap[0].inRange).toBe(true);
    expect(noMap[0].rangeKnown).toBe(false);
  });
  it('an inRange predicate (AoE "in area") overrides the distance check; null means unknown', () => {
    const inArea: Record<string, boolean | null> = { in: true, out: false, unk: null };
    const ranked = rankTargets([mon('in'), mon('out'), mon('unk')], {
      self: pc('me'), distanceFt: () => 100, maxRangeFt: 5, inRange: t => inArea[t.id],
    });
    const by = (id: string) => ranked.find(r => r.target.id === id)!;
    expect(by('in')).toMatchObject({ inRange: true, rangeKnown: true });
    expect(by('out')).toMatchObject({ inRange: false, rangeKnown: true });
    expect(by('unk')).toMatchObject({ inRange: true, rangeKnown: false });
  });
  it('takes the actor participant_type from the self option when the actor is not in the list', () => {
    const ranked = rankTargets([pc('friend'), mon('foe')], { self: { id: 'me', participant_type: 'creature' } });
    expect(ranked.map(r => [r.target.id, r.group])).toEqual([['friend', 'hostile'], ['foe', 'ally']]);
  });
  it('HEAL_GROUP_ORDER puts 0-HP creatures first and the dead still last', () => {
    const list = [mon('foe'), pc('dead', { is_dead: true, current_hp: 0 }), pc('me'), pc('friend'), pc('down', { current_hp: 0 })];
    const ids = rankTargets(list, { self: { id: 'me' }, allowSelfTarget: true, order: HEAL_GROUP_ORDER }).map(r => r.target.id);
    expect(ids).toEqual(['down', 'friend', 'me', 'foe', 'dead']);
    expect(HEAL_GROUP_ORDER).toHaveLength(TARGET_GROUP_ORDER.length);
  });
  it('is deterministic: identical input in any order ranks identically (name then id tiebreak)', () => {
    const a = [mon('x', { name: 'Goblin' }), mon('y', { name: 'Goblin' }), mon('z', { name: 'Bugbear' })];
    const fwd = rankTargets(a, { self: pc('me') }).map(r => r.target.id);
    const rev = rankTargets([...a].reverse(), { self: pc('me') }).map(r => r.target.id);
    expect(fwd).toEqual(['z', 'x', 'y']);
    expect(rev).toEqual(fwd);
  });
});

describe('compareRanked / groupRanked / autoSelectIds', () => {
  it('compareRanked places unknown groups after every known one', () => {
    const mk = (group: string) => ({ target: mon('t'), group: group as never, isSelf: false, distanceFt: null, inRange: true, rangeKnown: false });
    expect(compareRanked(mk('bogus'), mk('dead'))).toBeGreaterThan(0);
    expect(compareRanked(mk('hostile'), mk('dead'))).toBeLessThan(0);
  });
  it('groupRanked emits only non-empty groups, in order, with labels, keeping rank order inside', () => {
    const list = [mon('dead', { is_dead: true }), mon('b'), mon('a')];
    const groups = groupRanked(rankTargets(list, { self: pc('me') }));
    expect(groups.map(g => [g.group, g.label, g.items.map(i => i.target.id)])).toEqual([
      ['hostile', 'Enemies', ['a', 'b']],
      ['dead', 'Dead', ['dead']],
    ]);
  });
  it('autoSelectIds pre-checks hostile+ally+down inside a KNOWN range and never the dead or the unmeasured', () => {
    const list = [
      mon('foe'), pc('friend'), mon('down', { current_hp: 0 }),
      mon('dead', { is_dead: true, current_hp: 0 }), mon('far'), mon('unmeasured'),
    ];
    const dist: Record<string, number | null> = { foe: 5, friend: 10, down: 15, dead: 5, far: 50, unmeasured: null };
    const ranked = rankTargets(list, { self: pc('me'), distanceFt: t => dist[t.id], maxRangeFt: 20 });
    expect(autoSelectIds(ranked).sort()).toEqual(['down', 'foe', 'friend']);
    expect(AUTO_SELECT_GROUPS).not.toContain('dead');
    // No range information at all → nothing is pre-checked (theatre of the mind).
    expect(autoSelectIds(rankTargets(list, { self: pc('me') }))).toEqual([]);
    // Caller can widen the groups (e.g. a heal that wants the dead too).
    expect(autoSelectIds(ranked, ['dead'])).toEqual(['dead']);
  });
});
