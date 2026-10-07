import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),event:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:mocks.from}}));
vi.mock('./combatEvents',()=>({newChainId:()=> 'chain',emitCombatEvent:mocks.event}));
import {declareAttack} from './pendingAttack';
const input={requestId:'paid-roll',campaignId:'camp',attackerName:'Psion',attackerType:'character' as const,targetName:'Goblin',attackName:'Destructive Thoughts',attackKind:'auto_hit' as const,damageDice:'12',damageType:'Psychic'};
it('recovers an existing declaration on an ambiguous retry instead of duplicating damage',async()=>{
 const existing={id:'paid-roll',state:'declared'};const eq=vi.fn();
 const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),eq,single:async()=>({data:null,error:{code:'23505'}}),maybeSingle:async()=>({data:existing,error:null})};eq.mockReturnValue(q);mocks.from.mockReturnValue(q);mocks.event.mockClear();
 expect(await declareAttack(input)).toBe(existing);expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({id:'paid-roll',damage_dice:'12',attack_kind:'auto_hit'}));expect(eq).toHaveBeenCalledWith('campaign_id','camp');expect(mocks.event).not.toHaveBeenCalled();
});
it('returns a paid declaration while history remains pending',async()=>{
 const existing={id:'paid-roll',state:'declared'};const q={insert:vi.fn(()=>q),select:vi.fn(()=>q),single:async()=>({data:existing,error:null})};mocks.from.mockReturnValue(q);
 mocks.event.mockReturnValue(new Promise(()=>{}));expect(await declareAttack(input)).toBe(existing);
});
