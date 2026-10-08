// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character,CombatParticipant,SpellData} from '../../types';
const saved=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/api/declaredSpells',()=>({saveSpellDeclaration:saved}));
const id='11111111-1111-4111-8111-111111111111',targetId='22222222-2222-4222-8222-222222222222';
const target={id:targetId,entity_id:targetId,name:'Goblin',participant_type:'creature',combatant_id:targetId,ac:14} as CombatParticipant;
vi.mock('../../context/CombatContext',()=>({useCombatSelector:(select:(s:unknown)=>unknown)=>select({encounter:{id,campaign_id:id,status:'active'},participants:[{id,entity_id:id,participant_type:'character',name:'Psion',combatant_id:id}]})}));
vi.mock('./TargetPickerModal',()=>({default:({onPick,onCancel,error}:{error?:string;onPick:(p:CombatParticipant)=>void;onCancel:()=>void})=><>{error&&<span role="alert">{error}</span>}<button onClick={()=>onPick(target)}>Choose goblin</button><button onClick={onCancel}>Cancel targets</button></>}));
import SpellAttackCastButton from './SpellAttackCastButton';
const character={id,campaign_id:id,spell_slots:{2:{total:1,used:0}}} as unknown as Character;
const spell={id:'mind-spike',name:'Mind Spike',level:2,casting_time:'1 Action',range:'120 feet',duration:'1 hour'} as SpellData;
function setup(){render(<SpellAttackCastButton character={character} spell={spell} userId={id} casting={{source:'class:Psion',ability:'intelligence',saveDC:15}} slotLevel={2} attackKind="save" saveAbility="WIS" saveSuccessEffect="half" damageDice="3d8" damageType="Psychic" maxRangeFt={120}/>);fireEvent.click(screen.getByRole('button',{name:'Cast'}));}
beforeEach(()=>{saved.mockReset();});afterEach(cleanup);
it('canceling target selection records neither a cast nor its cost',()=>{setup();fireEvent.click(screen.getByRole('button',{name:'Cancel targets'}));expect(saved).not.toHaveBeenCalled();});
it('saves an immutable paid intent with original source and target identity',()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Choose goblin'}));
 expect(saved).toHaveBeenCalledOnce();expect(saved.mock.calls[0][0]).toMatchObject({characterId:id,participantId:id,spellId:'mind-spike',slotLevel:2,expectedSlot:{total:1,used:0},context:{source:'class:Psion',saveDC:15,target:'Goblin',combat:{kind:'save',damageDice:'3d8',target:{participantId:targetId,entityId:targetId,combatantId:targetId}}}});
 expect(character.spell_slots[2].used).toBe(0);expect(screen.queryByRole('button',{name:'Choose goblin'})).toBeNull();
});
it('keeps a failed save visible rather than silently opening a new cast',()=>{
 saved.mockImplementation(()=>{throw new Error('Resolve the saved spell declaration');});setup();fireEvent.click(screen.getByRole('button',{name:'Choose goblin'}));
 expect(screen.getByRole('alert').textContent).toContain('Resolve');expect(screen.getByRole('button',{name:'Choose goblin'})).toBeTruthy();
});
