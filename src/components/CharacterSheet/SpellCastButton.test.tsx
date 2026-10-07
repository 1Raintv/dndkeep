// @vitest-environment happy-dom
import {cleanup,render} from '@testing-library/react';
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
vi.mock('../../lib/healSpells',()=>({findHealSpell:()=>undefined}));
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
