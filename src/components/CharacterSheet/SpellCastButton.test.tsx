// @vitest-environment happy-dom
import {useState} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character,SpellData} from '../../types';
const mocks=vi.hoisted(()=>({attack:vi.fn(),log:vi.fn(),roll:vi.fn()}));
vi.mock('../../lib/supabase',()=>({supabase:{from:()=>{throw new Error('Unit test attempted database access');}}}));
vi.mock('../../lib/gameUtils',()=>({rollDie:()=>3,computeStats:()=>({modifiers:{intelligence:4,wisdom:1,charisma:-1},proficiency_bonus:3})}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:mocks.roll})}));
vi.mock('../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../Combat/SpellAttackCastButton',()=>({default:(props:unknown)=>{mocks.attack(props);return null;}}));
vi.mock('../../lib/summonTokens',()=>({SUMMON_TOKEN_SPELLS:{},placeSummonToken:vi.fn()}));
vi.mock('../../lib/auras',()=>({AURA_SPELLS:{}}));
vi.mock('../../lib/buffs',()=>({BUFF_SPELL_REGISTRY:{'mage hand':{}}}));
vi.mock('../Combat/BuffTargetPickerModal',()=>({default:()=> <div role="dialog">Choose buff targets</div>}));
vi.mock('../../lib/healSpells',async importOriginal=>({...await importOriginal<typeof import('../../lib/healSpells')>(),findHealSpell:()=>undefined}));
vi.mock('./SummonFormPickerModal',()=>({default:()=>null}));
vi.mock('../Combat/SpellTargetPickerModal',()=>({default:({onClose}:{onClose:()=>void})=><div role="dialog">Area targets<button onClick={onClose}>Cancel targets</button></div>}));
vi.mock('../Combat/MultiAttackPickerModal',()=>({default:({onClose}:{onClose:()=>void})=><div role="dialog">Beam targets<button onClick={onClose}>Cancel targets</button></div>}));
import SpellCastButton from './SpellCastButton';
const character={id:'caster',class_name:'Psion',level:6,subclass:'Telepath',known_spells:['mind-sliver','mage-hand'],prepared_spells:[],spell_slots:{},spell_sources:{'mind-sliver':['class:Psion'],'mage-hand':['grant:class:Psion']}} as unknown as Character;
const spell:SpellData={school:'Enchantment',components:'V',duration:'1 round',concentration:false,ritual:false,classes:['Psion'],id:'mind-sliver',name:'Mind Sliver',level:0,casting_time:'1 action',range:'60 feet',description:'',save_type:'INT',damage_type:'Psychic',damage_at_char_level:{'1':'1d6','5':'2d6','11':'3d6'}};
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
it.each([true,false])('declares scaled Psion damage and no damage on successful save in compact=%s',compact=>{
 render(<SpellCastButton spell={spell} character={character} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()} compact={compact}/>);
 expect(mocks.attack).toHaveBeenLastCalledWith(expect.objectContaining({character:expect.objectContaining({id:'caster'}),damageDice:'2d6+4',casting:expect.objectContaining({saveDC:15}),saveSuccessEffect:'none',attackKind:'save'}));
});
it('sends a flat INT bonus that crit doubling does not multiply',()=>{
 render(<SpellCastButton spell={{...spell,save_type:undefined,attack_type:'ranged',damage_dice:'1d6'}} character={character} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()}/>);
 expect(mocks.attack).toHaveBeenLastCalledWith(expect.objectContaining({damageDice:'2d6+4',attackKind:'attack_roll'}));
});
it('excludes a different class source from the combat damage bonus',()=>{
 render(<SpellCastButton spell={spell} character={{...character,secondary_class:'Wizard',secondary_level:1,spell_sources:{'mind-sliver':['class:Wizard']}}} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()}/>);
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
 render(<SpellCastButton spell={healing} character={{...character,subclass:'Metamorph',known_spells:['cure-wounds'],spell_sources:{'cure-wounds':['grant:class:Psion']},spell_slots:{'1':{total:4,used:0},'2':{total:3,used:0}}}} userId="owner" onUpdateSlots={update} onLeveledSpellCast={action} compact={compact}/>);
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
 render(<SpellCastButton spell={{...spell,id:'cure-wounds',name:'Cure Wounds',level:1,save_type:undefined,damage_at_char_level:undefined,heal_dice:'2d8+MOD',higher_levels:'Heal more with a higher slot.'}} character={{...character,subclass:'Metamorph',known_spells:['cure-wounds'],spell_sources:{'cure-wounds':['grant:class:Psion']},spell_slots:{'1':{total:4,used:0},'2':{total:3,used:0}}}} userId="owner" onUpdateSlots={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'2d8+MOD'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(update).not.toHaveBeenCalled();expect(mocks.roll).not.toHaveBeenCalled();expect(mocks.log).not.toHaveBeenCalled();
});

it('records flat healing without inventing dice to animate',async()=>{
 const update=vi.fn();
 render(<SpellCastButton spell={{...spell,id:'heal',name:'Heal',level:6,save_type:undefined,damage_at_char_level:undefined,heal_dice:'70'}} character={{...character,class_name:'Cleric',subclass:null,level:11,known_spells:['heal'],prepared_spells:['heal'],spell_sources:{heal:['class:Cleric']},spell_slots:{'6':{total:1,used:0}}}} userId="owner" onUpdateSlots={update}/>);
 fireEvent.click(screen.getByRole('button',{name:'70'}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({characterId:'caster',actionType:'heal',total:70,individualResults:[]})));
 expect(mocks.roll).not.toHaveBeenCalled();expect(update).toHaveBeenCalledOnce();
});

it('repairs an unreviewed cantrip beside its casting control without inventing ownership',()=>{
 const saved=vi.fn();
 function Legacy(){const [pc,setPc]=useState({...character,spell_sources:{}});return <SpellCastButton spell={spell} character={pc} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()} onReviewSpellSources={patch=>{saved(patch);setPc(current=>({...current,...patch}));}}/>;}
 render(<Legacy/>);expect(mocks.attack).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Review spell source'}));
 fireEvent.click(screen.getByRole('checkbox',{name:'Learned through Psion'}));
 fireEvent.click(screen.getByRole('button',{name:'Save spell sources'}));
 expect(saved).toHaveBeenCalledWith(expect.objectContaining({spell_sources:{'mind-sliver':['class:Psion']}}));
 expect(mocks.attack).toHaveBeenLastCalledWith(expect.objectContaining({damageDice:'2d6+4',casting:expect.objectContaining({saveDC:15})}));
});
it('casts a feat spell with its explicitly chosen ability and no Psion-only bonus',()=>{
 render(<SpellCastButton spell={spell} character={{...character,spell_sources:{'mind-sliver':['feat']}}} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()}/>);
 expect(mocks.attack).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole('combobox',{name:'Cast Mind Sliver through'}),{target:{value:'feat:wisdom'}});
 expect(mocks.attack).toHaveBeenLastCalledWith(expect.objectContaining({damageDice:'2d6',casting:expect.objectContaining({saveDC:12})}));
});

it('records a concentration utility cast once with its actual source and slot',async()=>{
 const onConcentrationCast=vi.fn(),update=vi.fn();
 const concentration={...spell,id:'detect-magic',name:'Detect Magic',level:1 as const,concentration:true,save_type:undefined,damage_at_char_level:undefined};
 render(<SpellCastButton spell={concentration} character={{...character,known_spells:['detect-magic'],prepared_spells:['detect-magic'],spell_sources:{'detect-magic':['class:Psion']},spell_slots:{'1':{total:4,used:0}}}} userId="owner" onUpdateSlots={update} onConcentrationCast={onConcentrationCast} compact/>);
 fireEvent.click(screen.getByRole('button',{name:'Cast'}));
 await waitFor(()=>expect(onConcentrationCast).toHaveBeenCalledOnce());
 expect(onConcentrationCast).toHaveBeenCalledWith(1,{source:'class:Psion',ability:'intelligence'});expect(update).toHaveBeenCalledOnce();
});
it('blocks another cast while a concentration recording needs confirmation',()=>{
 render(<SpellCastButton spell={spell} character={character} userId="owner" onUpdateSlots={vi.fn()} castingBlocked/>);
 expect((screen.getByRole('button',{name:'Finish pending casting first'}) as HTMLButtonElement).disabled).toBe(true);expect(mocks.attack).not.toHaveBeenCalled();
});

it.each([true,false])('keeps post-cast targets open while concentration saves in compact=%s',async compact=>{
 function Sheet(){const [blocked,setBlocked]=useState(false);return <SpellCastButton spell={{...spell,id:'mage-hand',name:'Mage Hand',save_type:undefined,damage_at_char_level:undefined,concentration:true}} character={character} userId="owner" campaignId="campaign" compact={compact} onUpdateSlots={vi.fn()} onConcentrationCast={()=>setBlocked(true)} castingBlocked={blocked}/>;}
 render(<Sheet/>);fireEvent.click(screen.getByRole('button',{name:'Cast'}));
 await waitFor(()=>expect(screen.getByRole('dialog').textContent).toBe('Choose buff targets'));
 expect((screen.getByRole('button',{name:'Finish pending casting first'}) as HTMLButtonElement).disabled).toBe(true);
});

it.each([true,false])('keeps post-cast choices when the final slot is spent in compact=%s',async compact=>{
 function Sheet(){const [hero,setHero]=useState<Character>({...character,spell_slots:{'1':{total:1,used:0}}});return <SpellCastButton spell={{...spell,id:'mage-hand',name:'Mage Hand',level:1,save_type:undefined,damage_at_char_level:undefined,concentration:true}} character={hero} userId="owner" campaignId="campaign" compact={compact} onUpdateSlots={slots=>setHero(previous=>({...previous,spell_slots:slots}))}/>;}
 render(<Sheet/>);fireEvent.click(screen.getByRole('button',{name:'Cast'}));
 if(!compact)fireEvent.click(screen.getAllByRole('button',{name:'Cast'}).slice(-1)[0]);
 await waitFor(()=>expect(screen.getByRole('dialog').textContent).toBe('Choose buff targets'));
 expect(screen.getByText('No Slots')).toBeTruthy();
});

it.each(['area','beams'])('opens only one compact %s target dialog and cancels without spending slots',async kind=>{
 const isArea=kind==='area',id=isArea?'thunderwave':'scorching-ray',className=isArea?'Psion':'Wizard',level=isArea?1:2;
 const selected:SpellData={...spell,id,name:isArea?'Thunderwave':'Scorching Ray',level,save_type:isArea?'CON':undefined,
   attack_type:isArea?undefined:'ranged',damage_dice:isArea?'2d8':'2d6',damage_type:isArea?'thunder':'fire',damage_at_char_level:undefined,
   area_of_effect:isArea?{type:'cube' as const,size:15}:undefined};
 const caster={...character,class_name:className,subclass:null,known_spells:[id],prepared_spells:[id],
   spell_sources:{[id]:[`class:${className}`]},spell_preparation_sources:{[id]:[`class:${className}`]},spell_slots:{[level]:{total:2,used:0}}} as Character;
 const update=vi.fn();render(<SpellCastButton compact spell={selected} character={caster} campaignId="c" userId="owner" onUpdateSlots={update}/>);
 fireEvent.click(screen.getByRole('button',{name:isArea?'Cast':/3 beams/}));
 const dialogs=await screen.findAllByRole('dialog');expect(dialogs).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Cancel targets'}));
 expect(screen.queryByRole('dialog')).toBeNull();expect(update).not.toHaveBeenCalled();
});
it.each([2,3])('retains damage defined only in the slot table at spell slot %i',slot=>{
 const c:Character={...character,known_spells:['mind-spike'],prepared_spells:['mind-spike'],spell_sources:{'mind-spike':['class:Psion']},spell_slots:{2:{total:2,used:0},3:{total:2,used:0}}};
 render(<SpellCastButton spell={{...spell,id:'mind-spike',name:'Mind Spike',level:2,save_type:'WIS',damage_at_char_level:undefined,damage_dice:undefined,damage_at_slot_level:{2:'3d8',3:'4d8'},higher_levels:'The damage increases by 1d8 for each spell slot level above 2.'}} character={c} userId="owner" campaignId="campaign" onUpdateSlots={vi.fn()} compact forceSlotLevel={slot}/>);
 expect(mocks.attack).toHaveBeenLastCalledWith(expect.objectContaining({slotLevel:slot,damageDice:slot===2?'3d8':'4d8',saveSuccessEffect:'half'}));
});

const utility:SpellData={...spell,id:'detect-magic',name:'Detect Magic',level:1,concentration:true,save_type:undefined,damage_at_char_level:undefined};
const utilityHero:Character={...character,known_spells:['detect-magic'],prepared_spells:['detect-magic'],spell_sources:{'detect-magic':['class:Psion']},spell_slots:{1:{total:4,used:4},3:{total:2,used:0}}};
it.each([true,false])('casts a non-scaling spell with the remaining higher slot in compact=%s',async compact=>{
 const update=vi.fn(),action=vi.fn(),concentration=vi.fn();
 render(<SpellCastButton spell={utility} character={utilityHero} userId="owner" compact={compact} onUpdateSlots={update} onLeveledSpellCast={action} onConcentrationCast={concentration}/>);
 fireEvent.click(screen.getByRole('button',{name:'Cast'}));
 if(!compact)fireEvent.click(screen.getByRole('button',{name:'Cast (Lvl 3)'}));
 await waitFor(()=>expect(update).toHaveBeenCalledOnce());expect(update).toHaveBeenCalledWith({1:{total:4,used:4},3:{total:2,used:1}});
 expect(action).toHaveBeenCalledOnce();expect(concentration).toHaveBeenCalledWith(3,{source:'class:Psion',ability:'intelligence'});
});
it('opens a non-scaling higher-slot picker at a real remaining tier and cancels without payment',()=>{
 const update=vi.fn();render(<SpellCastButton spell={utility} character={utilityHero} userId="owner" upcastTrigger onUpdateSlots={update}/>);
 fireEvent.click(screen.getByRole('button',{name:/Upcast at higher slot/}));
 expect(screen.getByRole('button',{name:/Upcast at Level 3/})).toBeTruthy();expect(screen.getByText(/A higher slot is allowed/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(update).not.toHaveBeenCalled();expect(mocks.log).not.toHaveBeenCalled();
});
it('never substitutes another tier for an exhausted forced-slot row',()=>{
 const update=vi.fn();render(<SpellCastButton spell={utility} character={utilityHero} userId="owner" forceSlotLevel={1} compact onUpdateSlots={update}/>);
 expect(screen.getByText('No Slots')).toBeTruthy();expect(screen.queryByRole('button',{name:'Cast'})).toBeNull();expect(update).not.toHaveBeenCalled();
});
it('manual upcast damage pays, consumes the action, and starts concentration once',async()=>{
 const update=vi.fn(),action=vi.fn(),concentration=vi.fn();
 render(<SpellCastButton spell={{...utility,description:'',damage_dice:'1d6',damage_type:'Psychic',attack_type:'ranged'}} character={utilityHero} userId="owner" upcastTrigger onUpdateSlots={update} onLeveledSpellCast={action} onConcentrationCast={concentration}/>);
 fireEvent.click(screen.getByRole('button',{name:/Upcast at higher slot/}));fireEvent.click(screen.getByRole('button',{name:/Upcast at Level 3.*Roll Damage/}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledOnce());expect(update).toHaveBeenCalledOnce();expect(action).toHaveBeenCalledOnce();expect(concentration).toHaveBeenCalledOnce();
 expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({diceExpression:'1d6',notes:'Level 3 slot'}));
});

it.each(['grant:class:Psion','class:Wizard'] as const)('logs Stronger Telekinesis casting range for source %s without changing the base spell',async source=>{
 const mageHand={...spell,id:'mage-hand',name:'Mage Hand',range:'30 feet',save_type:undefined,damage_at_char_level:undefined};
 render(<SpellCastButton spell={mageHand} character={{...character,subclass:'Psykinetic',secondary_class:'Wizard',secondary_level:1,spell_sources:{'mage-hand':[source]}}} userId="owner" onUpdateSlots={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Cast'}));
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({notes:expect.stringContaining('60 feet')})));
 expect(mageHand.range).toBe('30 feet');
});
