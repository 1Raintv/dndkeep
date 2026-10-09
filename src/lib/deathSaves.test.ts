import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./api/psionicTurns',()=>({psionicRpc:m.rpc}));
import {createPendingDeathSave} from './deathSaves';
const input={campaignId:'campaign',encounterId:'encounter',participantId:'part',characterId:'hero',turnId:'turn'};
const row={id:'save',character_id:'hero',participant_id:'part',campaign_id:'campaign',encounter_id:'encounter',state:'pending'};
beforeEach(()=>{vi.clearAllMocks();m.rpc.mockResolvedValue(row);});
it('passes the exact observed turn token to idempotent creation',async()=>{
 expect(await createPendingDeathSave(input)).toEqual(row);
 expect(m.rpc).toHaveBeenCalledWith('create_death_save_offer',{p_character:'hero',p_participant:'part',p_turn:'turn'},true);
});
it('does not invent a prompt when the creature is not dying',async()=>{m.rpc.mockResolvedValue(null);expect(await createPendingDeathSave(input)).toBeNull();});
it('rejects a different target receipt',async()=>{m.rpc.mockResolvedValue({...row,character_id:'other'});await expect(createPendingDeathSave(input)).rejects.toThrow('verified');});
it('propagates creation errors rather than silently losing the save',async()=>{m.rpc.mockRejectedValue(new Error('Turn changed'));await expect(createPendingDeathSave(input)).rejects.toThrow('Turn changed');});
