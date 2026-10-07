import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({recover:vi.fn(),event:vi.fn(),error:vi.fn()}));
vi.mock('./api/psionicReserves',()=>({recoverPsionicReserves:m.recover}));
vi.mock('./combatEvents',()=>({emitCombatEvent:m.event}));
vi.mock('./log',()=>({log:{error:m.error}}));
import {recoverInitiativeResources} from './initiativeResources';
const p={participant_type:'character',entity_id:'hero',campaign_id:'camp',encounter_id:'enc',name:'Psion'};
beforeEach(()=>{vi.clearAllMocks();m.recover.mockResolvedValue(2);});
it('logs confirmed recovery with participant visibility',async()=>{
 await recoverInitiativeResources({...p,hidden_from_players:true});
 expect(m.recover).toHaveBeenCalledWith('hero');
 expect(m.event).toHaveBeenCalledWith(expect.objectContaining({visibility:'hidden_from_players',payload:expect.objectContaining({recovered:2})}));
});
it('does not recover creature resources',async()=>{
 await recoverInitiativeResources({...p,participant_type:'creature'});
 expect(m.recover).not.toHaveBeenCalled();
});
it('does not claim a recovery for an ineligible/full character',async()=>{
 m.recover.mockResolvedValue(0);await recoverInitiativeResources(p);expect(m.event).not.toHaveBeenCalled();
});
it('records failed recovery without failing already-started combat',async()=>{
 m.recover.mockRejectedValue(new Error('offline'));await recoverInitiativeResources(p);
 expect(m.error).toHaveBeenCalled();expect(m.event).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({description:expect.stringContaining('could not sync'),recovered:0})}));
});
