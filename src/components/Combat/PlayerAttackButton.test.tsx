// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {CombatParticipant,PendingAttack} from '../../types';
const api=vi.hoisted(()=>({declareAttack:vi.fn(),rollAttackRoll:vi.fn()}));
vi.mock('../../lib/pendingAttack',()=>api);
const target={id:'target',name:'Goblin',participant_type:'creature',ac:13} as CombatParticipant;
vi.mock('../../context/CombatContext',()=>({useCombatSelector:(select:(s:unknown)=>unknown)=>select({encounter:{id:'enc',campaign_id:'camp',status:'active'},participants:[{id:'self',entity_id:'char',participant_type:'character',name:'Psion'}]})}));
vi.mock('./TargetPickerModal',()=>({default:({onPick}:{onPick:(p:CombatParticipant)=>void})=><button onClick={()=>onPick(target)}>Choose goblin</button>}));
import PlayerAttackButton from './PlayerAttackButton';
const receipt={id:'attack',state:'declared'} as PendingAttack;
beforeEach(()=>{vi.clearAllMocks();api.declareAttack.mockResolvedValue(receipt);api.rollAttackRoll.mockResolvedValue({...receipt,state:'attack_rolled'});});
afterEach(cleanup);
function start(onDeclared:()=>void=vi.fn(),attackKind:'attack_roll'|'save'|'auto_hit'='attack_roll'){
 render(<PlayerAttackButton characterId="char" source="spell" damageDice="2d6" damageType="psychic" attackName="Psion spell" attackKind={attackKind} onDeclared={onDeclared}/>);
 fireEvent.click(screen.getByRole('button',{name:/Attack/}));fireEvent.click(screen.getByRole('button',{name:'Choose goblin'}));return onDeclared;
}
it('does not spend or roll when no declaration is confirmed',async()=>{
 api.declareAttack.mockResolvedValue(null);const paid=start();await waitFor(()=>expect(api.declareAttack).toHaveBeenCalled());await act(async()=>{});
 expect(paid).not.toHaveBeenCalled();expect(api.rollAttackRoll).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('not confirmed');
});
it('retries the same declaration after an unknown response, preserving its target and cost callback',async()=>{
 api.declareAttack.mockRejectedValueOnce(new Error('response lost'));const paid=start();await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Retry declaration'}));await waitFor(()=>expect(paid).toHaveBeenCalledTimes(1));
 expect(api.declareAttack.mock.calls[0][0].requestId).toBeTruthy();expect(api.declareAttack.mock.calls[1][0]).toEqual(api.declareAttack.mock.calls[0][0]);
 expect(api.rollAttackRoll).toHaveBeenCalledTimes(1);
});
it.each(['save','auto_hit'] as const)('confirms a %s declaration without an attack roll',async(kind)=>{
 const paid=start(vi.fn(),kind);await waitFor(()=>expect(paid).toHaveBeenCalledTimes(1));expect(api.rollAttackRoll).not.toHaveBeenCalled();
});
it.each(['null','throw'])('keeps the confirmed cost when attack rolling fails (%s)',async(mode)=>{
 if(mode==='throw')api.rollAttackRoll.mockRejectedValueOnce(new Error('offline'));else api.rollAttackRoll.mockResolvedValueOnce(null);
 const paid=start();await waitFor(()=>expect(paid).toHaveBeenCalledTimes(1));await screen.findByRole('alert');
 expect(screen.getByRole('alert').textContent).toContain('DM');expect(api.declareAttack).toHaveBeenCalledTimes(1);
});
it('records the cost before starting the attack roll',async()=>{
 const order:string[]=[];api.rollAttackRoll.mockImplementation(async()=>{order.push('roll');return receipt;});start(()=>{order.push('cost');});
 await waitFor(()=>expect(order).toEqual(['cost','roll']));
});
it('does not roll or retry the payment callback after a confirmed declaration callback throws',async()=>{
 const paid=vi.fn(()=>{throw new Error('sheet save unavailable');});start(paid);await screen.findByRole('alert');
 expect(paid).toHaveBeenCalledTimes(1);expect(api.rollAttackRoll).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Retry declaration'})).toBeNull();
 expect(screen.getByRole('alert').textContent).toContain('resources');
});
