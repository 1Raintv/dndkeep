// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({record:vi.fn(),query:vi.fn(),roll:vi.fn(),event:vi.fn(),reactions:vi.fn(),remove:vi.fn(),riderOptions:vi.fn(),riders:[] as unknown[],attack:{} as Record<string,unknown>,prior:null as unknown,writeError:null as unknown,riderError:null as unknown,patch:null as Record<string,unknown>|null,filters:[] as unknown[][],selections:[] as string[]}));
vi.mock('./api/pendingDamage',()=>({recordPendingDamage:m.record}));
vi.mock('./supabase',()=>({supabase:{from:m.query}}));
vi.mock('../rules/dice',async original=>({...await original<typeof import('../rules/dice')>(),rollDiceExpr:m.roll}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event,newChainId:()=> 'chain'}));
vi.mock('./pendingReaction',()=>({offerReactionsFor:m.reactions}));
vi.mock('./buffs',()=>({getDamageRiders:(_b:unknown,opts:unknown)=>{m.riderOptions(opts);return m.riders;},removeBuff:m.remove}));
vi.mock('./combatParticipantNormalize',()=>({JOINED_COMBATANT_FIELDS:'combatants:combatant_id(active_buffs)',normalizeParticipantRow:(r:unknown)=>r}));
import {rollDamage} from './pendingAttack';
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear();m.riders=[];m.prior=null;m.writeError=null;m.riderError=null;m.patch=null;m.filters=[];m.selections=[];
 m.attack={id:'attack',attack_name:'Psychic hit',attack_kind:'attack_roll',hit_result:'hit',damage_dice:'1d6+2',damage_type:'psychic',state:'attack_rolled',attacker_participant_id:'actor'};
 m.roll.mockReturnValue({rolls:[3],modifier:2,total:5});
 m.record.mockImplementation(async r=>{if(m.writeError)throw new Error('Damage not confirmed');m.patch={damage_rolls:r.rolls,damage_raw:r.raw,damage_final:r.final,damage_components:r.components,state:'damage_rolled'};return {attack:{...r.attack,...m.patch},replayed:false};});
 m.query.mockImplementation((table:string)=>{let update=false,group=false;const result=()=>({data:table==='combat_participants'?{active_buffs:[]}:group?m.prior:update?(m.writeError?null:{...m.attack,...m.patch}):m.attack,error:table==='combat_participants'?m.riderError:update?m.writeError:null});const q={select:(v:string)=>{m.selections.push(v);return q;},eq:(...v:unknown[])=>{m.filters.push(v);if(v[0]==='damage_group_id')group=true;return q;},not:()=>q,limit:()=>q,update:(p:Record<string,unknown>)=>{update=true;m.patch=p;return q;},single:async()=>result(),maybeSingle:async()=>result()};return q;});
});
it('stores psychic base and fire rider dice with their own modifiers and totals',async()=>{
 m.riders=[{buff:{key:'fire',name:'Fire rider',source:'feature',damageRider:{damageType:'fire'}},dice:'1d4+1'}];m.roll.mockReturnValueOnce({rolls:[3],modifier:2,total:5}).mockReturnValueOnce({rolls:[2],modifier:1,total:3});await rollDamage('attack');
 const packet=m.patch!.damage_components as {components:Record<string,unknown>[]};expect(packet.components.map(c=>[c.damageType,c.rawTotal,c.modifier])).toEqual([['psychic',5,2],['fire',3,1]]);expect(m.patch!.damage_final).toBe(8);expect(m.selections).toContain('combatants:combatant_id(active_buffs)');expect(m.record).toHaveBeenCalledWith(expect.objectContaining({attack:expect.objectContaining({state:'attack_rolled'})}));
});
it('distinguishes a fixed critical maximum from a rolled die',async()=>{
 localStorage.setItem('dndkeep:houseRules','{"critRule":"max_plus_roll"}');m.attack.hit_result='crit';await rollDamage('attack');const packet=m.patch!.damage_components as {components:Record<string,unknown>[]};expect(packet.components[0]).toMatchObject({rolls:[3,6],dieKinds:['rolled','maximum'],rawTotal:11,modifier:2});
});
it('records old shared rolls as unknown instead of inventing provenance',async()=>{
 m.attack.damage_group_id='group';m.prior={damage_rolls:[4],damage_raw:6};await rollDamage('attack');expect((m.patch!.damage_components as {components:Record<string,unknown>[]}).components[0].dieKinds).toEqual(['unknown']);expect(m.roll).not.toHaveBeenCalled();
});
it('missing attacker bonuses stop recording instead of silently dropping damage',async()=>{
 m.riderError={message:'Offline'};await expect(rollDamage('attack')).rejects.toThrow(/bonuses could not/);expect(m.patch).toBeNull();expect(m.event).not.toHaveBeenCalled();
});
it('failed or stale recording does not consume a single-use rider or emit a damage event',async()=>{
 m.riders=[{buff:{key:'once',name:'Once',source:'feature',singleUse:true},dice:'1d6'}];m.writeError={message:'stale'};await expect(rollDamage('attack')).rejects.toThrow(/not confirmed/);expect(m.remove).not.toHaveBeenCalled();expect(m.event).not.toHaveBeenCalled();expect(m.reactions).toHaveBeenCalledTimes(1);expect(m.reactions).toHaveBeenCalledWith(m.attack,'post_attack_roll');
});
it('misses record zero components and no fresh dice',async()=>{
 m.attack.hit_result='miss';await rollDamage('attack');expect(m.patch?.damage_components).toEqual({version:1,components:[]});expect(m.roll).not.toHaveBeenCalled();
});

it('shared typed critical rolls preserve synthetic provenance without another roll',async()=>{
 localStorage.setItem('dndkeep:houseRules','{"critRule":"max_plus_roll"}');m.attack.hit_result='crit';m.attack.damage_group_id='group';
 const component={key:'base',source:'base',label:'Psychic hit',damageType:'psychic',expression:'1d6+2',rolls:[3,6],dieKinds:['rolled','maximum'],modifier:2,rawTotal:11};
 m.prior={damage_rolls:[3,6],damage_raw:11,damage_components:{version:1,components:[component]}};
 await rollDamage('attack');expect((m.patch!.damage_components as {components:Record<string,unknown>[]}).components[0]).toEqual(component);expect(m.roll).not.toHaveBeenCalled();expect(m.patch!.damage_final).toBe(11);
});
it('a stale miss cannot overwrite a completed attack or report success',async()=>{
 m.attack.hit_result='miss';m.writeError={message:'stale'};await expect(rollDamage('attack')).rejects.toThrow(/not confirmed/);expect(m.record).toHaveBeenCalledWith(expect.objectContaining({attack:expect.objectContaining({state:'attack_rolled'})}));expect(m.event).not.toHaveBeenCalled();
});

it('a competing winning record is returned without logging discarded dice',async()=>{
 const winner={...m.attack,state:'damage_rolled',damage_raw:9,damage_final:9};m.record.mockResolvedValue({attack:winner,replayed:true});expect(await rollDamage('attack')).toEqual(winner);expect(m.event).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();expect(m.reactions).toHaveBeenCalledWith(winner,'post_damage_roll');
});

it('queued Psion dice become typed damage without another roll or modifier',async()=>{m.attack.attack_kind='auto_hit';m.attack.attack_name='Destructive Thoughts';m.attack.damage_dice='17';m.attack.psionic_damage_dice={version:1,sides:8,originalRolls:[1,5,3],rolls:[4,5,4],modifier:4};await rollDamage('attack');expect(m.roll).not.toHaveBeenCalled();expect(m.patch).toMatchObject({damage_raw:17,damage_final:17,damage_rolls:[4,5,4],damage_components:{version:1,components:[expect.objectContaining({expression:'3d8+4',modifier:4,dieKinds:['adjusted','rolled','adjusted']})]}});});
it('corrupt queued Psion dice stop before rolling or recording',async()=>{m.attack.psionic_damage_dice={};await expect(rollDamage('attack')).rejects.toThrow(/invalid/);expect(m.roll).not.toHaveBeenCalled();expect(m.record).not.toHaveBeenCalled();});

it.each(['melee','ranged'] as const)('damage bonuses use captured %s mode rather than generic spell source',async mode=>{
 m.attack.attack_source='spell';m.attack.attack_mode=mode;await rollDamage('attack');
 expect(m.riderOptions).toHaveBeenCalledWith(expect.objectContaining({isMelee:mode==='melee'}));
});

it('unconfirmed reaction recovery stops before rolling or recording damage',async()=>{
 m.reactions.mockRejectedValueOnce(new Error('Offers not confirmed'));
 await expect(rollDamage('attack')).rejects.toThrow('Offers not confirmed');expect(m.roll).not.toHaveBeenCalled();expect(m.record).not.toHaveBeenCalled();
});
it('already saved damage recovers its offers without rolling again',async()=>{
 m.attack.state='damage_rolled';expect(await rollDamage('attack')).toEqual(m.attack);expect(m.roll).not.toHaveBeenCalled();expect(m.record).not.toHaveBeenCalled();expect(m.reactions).toHaveBeenCalledWith(m.attack,'post_damage_roll');
});
