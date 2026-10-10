import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),saved:vi.fn(),prepare:vi.fn(),confirm:vi.fn(),automatic:vi.fn()}));
vi.mock('./api/psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('./api/deathSaves',()=>({savedDeathSave:m.saved,prepareDeathSave:m.prepare,confirmDeathSave:m.confirm,resolveAutomaticDeathSaveRoll:m.automatic}));
import {createPendingDeathSave,resolveAutomaticDeathSave} from './deathSaves';
const input={campaignId:'campaign',encounterId:'encounter',participantId:'part',characterId:'hero',turnId:'turn'};
const row={id:'save',character_id:'hero',participant_id:'part',campaign_id:'campaign',encounter_id:'encounter',state:'pending'};
beforeEach(()=>{vi.clearAllMocks();m.rpc.mockResolvedValue(row);m.saved.mockReturnValue(null);m.prepare.mockResolvedValue({});m.confirm.mockResolvedValue({});m.automatic.mockResolvedValue(undefined);});
it('passes the exact observed turn token to idempotent creation',async()=>{
 expect(await createPendingDeathSave(input)).toEqual(row);
 expect(m.rpc).toHaveBeenCalledWith('create_death_save_offer',{p_character:'hero',p_participant:'part',p_turn:'turn',p_automatic:false},true);
});
it('does not invent a prompt when the creature is not dying',async()=>{m.rpc.mockResolvedValue(null);expect(await createPendingDeathSave(input)).toBeNull();});
it('rejects a different target receipt',async()=>{m.rpc.mockResolvedValue({...row,character_id:'other'});await expect(createPendingDeathSave(input)).rejects.toThrow('verified');});
it('propagates creation errors rather than silently losing the save',async()=>{m.rpc.mockRejectedValue(new Error('Turn changed'));await expect(createPendingDeathSave(input)).rejects.toThrow('Turn changed');});

it('automatic mode creates an automatic offer and resolves its saved roll',async()=>{
 await resolveAutomaticDeathSave(input);expect(m.rpc).toHaveBeenCalledWith('create_death_save_offer',{p_character:'hero',p_participant:'part',p_turn:'turn',p_automatic:true},true);expect(m.automatic).toHaveBeenCalledWith('hero','save');
});
it('already-resolved offers do not cause another automatic save',async()=>{
 m.rpc.mockResolvedValue({...row,state:'rolled'});await resolveAutomaticDeathSave(input);expect(m.automatic).not.toHaveBeenCalled();
});
it('a lost response with locally saved dice is still recoverable after resolution',async()=>{
 m.rpc.mockResolvedValue({...row,state:'rolled'});m.saved.mockReturnValue({dice:[12]});await resolveAutomaticDeathSave(input);expect(m.automatic).toHaveBeenCalledWith('hero','save');
});
