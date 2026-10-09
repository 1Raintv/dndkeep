// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {CombatParticipant} from '../../types';
const m=vi.hoisted(()=>({spend:vi.fn(),reset:vi.fn(),toast:vi.fn(),close:vi.fn()}));
vi.mock('../../lib/legendaryResistance',()=>({spendLegendaryResistanceManually:m.spend,resetLegendaryResistance:m.reset}));
vi.mock('../shared/Toast',()=>({useToast:()=>({showToast:m.toast})}));
import LegendaryResistancePopover from './LegendaryResistancePopover';
beforeEach(()=>{vi.clearAllMocks();m.spend.mockResolvedValue(undefined);m.reset.mockResolvedValue(undefined);});
afterEach(cleanup);
it.each(['Spend one','Reset'])('surfaces an unconfirmed %s operation instead of an unhandled rejection',async label=>{
 const operation=label==='Spend one'?m.spend:m.reset;
 operation.mockRejectedValueOnce(new Error('Encounter lair setting could not be verified. Retry.'));
 render(<LegendaryResistancePopover participant={{id:'target',name:'Dragon',legendary_resistance:3,legendary_resistance_used:1} as unknown as CombatParticipant} campaignId="campaign" encounterId="encounter" anchor={{x:100,y:100}} onClose={m.close}/>);
 fireEvent.click(screen.getByRole('button',{name:label}));
 await waitFor(()=>expect(m.toast).toHaveBeenCalledWith('Encounter lair setting could not be verified. Retry.','error'));
 expect(operation).toHaveBeenCalledTimes(1);expect(m.close).toHaveBeenCalledTimes(1);
});
