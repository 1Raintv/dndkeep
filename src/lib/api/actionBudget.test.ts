import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
import {getActionBudget} from './actionBudget';
const id='00000000-0000-4000-8000-000000000001';
const budget={context:{actorId:id,turnId:'turn',ownerTurnId:'own',encounterId:null,participantId:null,isOwnTurn:true},spent:{action:false,bonusAction:true,reaction:false},claimed:{action:false,bonusAction:true,reaction:false}};
beforeEach(()=>vi.resetAllMocks());
it('reads authenticated budget flags without a write',async()=>{m.rpc.mockResolvedValue(budget);expect(await getActionBudget(id)).toEqual(budget);expect(m.rpc).toHaveBeenCalledWith('get_action_budget',{p_character:id},true);});
it.each([{context:{...budget.context,actorId:'other'}},{spent:{...budget.spent,bonusAction:false}},{spent:{...budget.spent,reaction:null}},{context:{...budget.context,encounterId:'bad'}}])('rejects contradictory/malformed flags %j',async patch=>{m.rpc.mockResolvedValue({...budget,...patch});await expect(getActionBudget(id)).rejects.toThrow(/verified/);});
