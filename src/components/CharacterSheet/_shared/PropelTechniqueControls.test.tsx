// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import PropelTechniqueControls from './PropelTechniqueControls';
import type {PropelRecord} from '../../../lib/api/psionicPropel';
import {pendingPropelTechniques,rememberPropelTechnique} from '../../../lib/propelTechniqueRecovery';
const mock=vi.hoisted(()=>({options:vi.fn(),choose:vi.fn()}));
vi.mock('../../../lib/api/propelTechniques',()=>({availablePropelTechniques:mock.options,choosePropelTechnique:mock.choose}));
const row={character_id:'00000000-0000-4000-8000-000000000001',request_id:'00000000-0000-4000-8000-000000000002'} as PropelRecord;
const options=[{kind:'boost',speedBonus:10},{kind:'disorient',preventsOpportunityAttacks:true},{kind:'bolt',damage:4}];
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();mock.options.mockReturnValue(options);mock.choose.mockResolvedValue(null);});afterEach(cleanup);
it('shows the exact optional effects without another roll or action',async()=>{
 render(<PropelTechniqueControls row={row}/>);await screen.findByRole('button',{name:/Boost · \+10 ft/});expect(screen.getByRole('button',{name:/Disorient.*target’s next turn/})).toBeTruthy();expect(screen.getByRole('button',{name:/Telekinetic Bolt · 4 Force/})).toBeTruthy();expect(screen.getByText(/No extra action or Energy Die/)).toBeTruthy();
});
it('saves one choice, disables alternatives during sending and shows the receipt',async()=>{
 render(<PropelTechniqueControls row={row}/>);const button=await screen.findByRole('button',{name:/Boost ·/});let finish!:(r:unknown)=>void;mock.choose.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(button);fireEvent.click(button);
 expect(pendingPropelTechniques(row.character_id)).toMatchObject([{choice:'boost'}]);expect(mock.choose).toHaveBeenCalledTimes(2);finish({choice:'boost'});
 await screen.findByText('Saved: Boost.');expect(pendingPropelTechniques(row.character_id)).toEqual([]);expect(screen.queryByRole('button',{name:/Disorient ·/})).toBeNull();
});
it('lost confirmation exposes only the original choice and survives remount',async()=>{
 const view=render(<PropelTechniqueControls row={row}/>);const button=await screen.findByRole('button',{name:/Boost ·/});mock.choose.mockRejectedValueOnce(new Error('Lost reply'));fireEvent.click(button);await screen.findByRole('button',{name:'Confirm saved technique'});expect(screen.queryByRole('button',{name:/Telekinetic Bolt ·/})).toBeNull();view.unmount();
 mock.choose.mockResolvedValue(null);render(<PropelTechniqueControls row={row}/>);await waitFor(()=>expect((screen.getByRole('button',{name:'Confirm saved technique'}) as HTMLButtonElement).disabled).toBe(false));
 mock.choose.mockResolvedValueOnce({choice:'boost',replayed:true});fireEvent.click(screen.getByRole('button',{name:'Confirm saved technique'}));await screen.findByText('Saved: Boost.');
});
it('reads and shows a different server winner without applying a second effect',async()=>{
 rememberPropelTechnique(row.character_id,{declarationId:row.request_id,choice:'boost'});mock.choose.mockResolvedValue({choice:'disorient'});render(<PropelTechniqueControls row={row}/>);await screen.findByText('Saved: Disorient.');expect(mock.choose).toHaveBeenCalledOnce();expect(pendingPropelTechniques(row.character_id)).toEqual([]);
});
it('starts reading after a save becomes a settled failure in the same mounted use',async()=>{
 mock.options.mockReturnValue([]);const view=render(<PropelTechniqueControls row={row}/>);expect(mock.choose).not.toHaveBeenCalled();mock.options.mockReturnValue(options);view.rerender(<PropelTechniqueControls row={row}/>);await screen.findByRole('button',{name:/Boost ·/});expect(mock.choose).toHaveBeenCalledOnce();
});
it('does not show effects when the saved receipt cannot be read',async()=>{
 mock.choose.mockRejectedValue(new Error('Read unavailable'));render(<PropelTechniqueControls row={row}/>);await screen.findByRole('alert');expect(screen.queryByRole('button',{name:/Boost ·/})).toBeNull();expect(screen.getByRole('button',{name:'Check saved technique'})).toBeTruthy();
});
