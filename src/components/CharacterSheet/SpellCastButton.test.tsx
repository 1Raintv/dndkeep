// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character,SpellData} from '../../types';
const mocks=vi.hoisted(()=>({attack:vi.fn(),log:vi.fn(),roll:vi.fn()}));
vi.mock('../../lib/supabase',()=>({supabase:{from:()=>{throw new Error('Unit test attempted database access');}}}));
vi.mock('../../lib/gameUtils',()=>({rollDie:()=>3,computeStats:()=>({modifiers:{intelligence:4},proficiency_bonus:3})}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:mocks.roll})}));
vi.mock('../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../Combat/PlayerAttackButton',()=>({default:(props:unknown)=>{mocks.attack(props);return null;}}));
vi.mock('../../lib/summonTokens',()=>({SUMMON_TOKEN_SPELLS:{},placeSummonToken:vi.fn()}));
vi.mock('../../lib/auras',()=>({AURA_SPELLS:{}}));
vi.mock('../../lib/buffs',()=>({BUFF_SPELL_REGISTRY:{}}));
vi.mock('../../lib/healSpells',async importOriginal=>({...await importOriginal<typeof import('../../lib/healSpells')>(),findHealSpell:()=>undefined}));
vi.mock('./SummonFormPickerModal',()=>({default:()=>null}));
import SpellCastButton from './SpellCastButton';
const character={id:'caster',class_name:'Psion',level:6,subclass:'Telepath',spell_slots:{},spell_sources:{'mind-sliver':['class:Psion']}} as unknown as Character;
const spell:SpellData={school:'Enchantment',components:'V',duration:'1 round',concentration:false,ritual:false,classes:['Psion'],id:'mind-sliver',name:'Mind Sliver',level:0,casting_time:'1 action',range:'60 feet',description:'',save_type:'INT',damage_type:'Psychic',damage_at_char_level:{'1':'1d6','5':'2d6','11':'3d6'}};
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
it.each([true,false])('declares scaled Psion damage and no damage on successful save in compact=%s',compact=>{
 render(<SpellCastButton spell={spell} character={character} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()} compact={compact}/>);
 expect(mocks.attack).toHaveBeenLastCalledWith(expect.objectContaining({characterId:'caster',damageDice:'2d6+4',saveDC:15,saveSuccessEffect:'none',attackKind:'save'}));
});
it('sends a flat INT bonus that crit doubling does not multiply',()=>{
 render(<SpellCastButton spell={{...spell,save_type:undefined,attack_type:'ranged',damage_dice:'1d6'}} character={character} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()}/>);
 expect(mocks.attack).toHaveBeenLastCalledWith(expect.objectContaining({damageDice:'2d6+4',attackKind:'attack_roll'}));
});
it('excludes a different class source from the combat damage bonus',()=>{
 render(<SpellCastButton spell={spell} character={{...character,spell_sources:{'mind-sliver':['class:Wizard']}}} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()}/>);
 expect(mocks.attack).toHaveBeenLastCalledWith(expect.objectContaining({damageDice:'2d6',saveSuccessEffect:'none'}));
});

it('logs a utility cast against the character, not the account',async()=>{
 render(<SpellCastButton spell={{...spell,id:'mage-hand',name:'Mage Hand',save_type:undefined,damage_at_char_level:undefined}} character={character} userId="owner" onUpdateSlots={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Cast'}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({characterId:'caster',actionType:'spell'})));
});
it.each([true,false])('heals with MOD and the chosen slot exactly once in compact=%s',async compact=>{
 const update=vi.fn(),action=vi.fn();
 const healing:SpellData={...spell,id:'cure-wounds',name:'Cure Wounds',higher_levels:'The healing increases by 2d8 for each slot level above 1.',level:1,save_type:undefined,damage_at_char_level:undefined,heal_dice:'2d8+MOD',heal_at_slot_level:{'1':'2d8+MOD','2':'4d8+MOD'}};
 render(<SpellCastButton spell={healing} character={{...character,spell_slots:{'1':{total:4,used:0},'2':{total:3,used:0}}}} userId="owner" onUpdateSlots={update} onLeveledSpellCast={action} compact={compact}/>);
 fireEvent.click(screen.getByRole('button',{name:'2d8+MOD'}));
 expect(update).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/Level 2/}));
 fireEvent.click(screen.getByRole('button',{name:/Upcast at Level 2.*Roll Healing/}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({characterId:'caster',actionType:'heal',diceExpression:'4d8+MOD'})));
 const result=mocks.log.mock.calls[0][0];
 expect(result.individualResults).toHaveLength(4);
 expect(result.total).toBe(result.individualResults.reduce((sum:number,n:number)=>sum+n,4));
 expect(mocks.roll).toHaveBeenCalledWith(expect.objectContaining({flatBonus:4,total:result.total}));
 expect(update).toHaveBeenCalledTimes(1);expect(update).toHaveBeenCalledWith({'1':{total:4,used:0},'2':{total:3,used:1}});
 expect(action).toHaveBeenCalledTimes(1);
});

it('does not claim a hit against an invented AC for an untargeted spell attack',async()=>{
 render(<SpellCastButton spell={{...spell,save_type:undefined,attack_type:'ranged',damage_dice:'1d6'}} character={character} userId="owner" onUpdateSlots={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Attack +7'}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({characterId:'caster',actionType:'attack',total:10,hitResult:''})));
});
it('canceling healing slot selection leaves slots, dice and history untouched',()=>{
 const update=vi.fn();
 render(<SpellCastButton spell={{...spell,level:1,save_type:undefined,damage_at_char_level:undefined,heal_dice:'2d8+MOD',higher_levels:'Heal more with a higher slot.'}} character={{...character,spell_slots:{'1':{total:4,used:0},'2':{total:3,used:0}}}} userId="owner" onUpdateSlots={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'2d8+MOD'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(update).not.toHaveBeenCalled();expect(mocks.roll).not.toHaveBeenCalled();expect(mocks.log).not.toHaveBeenCalled();
});

it('records flat healing without inventing dice to animate',async()=>{
 const update=vi.fn();
 render(<SpellCastButton spell={{...spell,id:'heal',name:'Heal',level:6,save_type:undefined,damage_at_char_level:undefined,heal_dice:'70'}} character={{...character,spell_slots:{'6':{total:1,used:0}}}} userId="owner" onUpdateSlots={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'70'}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({characterId:'caster',actionType:'heal',total:70,individualResults:[]})));
 expect(mocks.roll).not.toHaveBeenCalled();expect(update).toHaveBeenCalledOnce();
});
