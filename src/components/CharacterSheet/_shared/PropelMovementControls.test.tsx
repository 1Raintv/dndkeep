// @vitest-environment happy-dom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
const m=vi.hoisted(()=>({read:vi.fn(),choose:vi.fn(),close:vi.fn()}));
vi.mock('../../../lib/api/propelMovement',()=>({readPropelMovement:m.read,choosePropelMovement:m.choose,closePropelMovement:m.close}));
import Controls from './PropelMovementControls';
import {pendingPropelMovements} from '../../../lib/propelMovementRecovery';
const c='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const row={outcome:'failed',caster_snapshot:{class_name:'Psion',level:5,subclass:'Psi Warper'},result:{feet:20},movement_choice:null};
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();m.read.mockResolvedValue(row);m.choose.mockResolvedValue({...row,movement_choice:{choice:'warp',feet:30}});});afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('offers the post-save choice and shows movement only after confirmation',async()=>{
 render(<Controls characterId={c} declarationId={id}/>);const b=await screen.findByRole('button',{name:'Warp · within 30 ft of you'});
 expect(screen.queryByTestId('propel-movement')).toBeNull();fireEvent.click(b);fireEvent.click(b);
 expect((await screen.findByTestId('propel-movement')).textContent).toContain('horizontal to you');expect(m.choose).toHaveBeenCalledTimes(1);expect(pendingPropelMovements(c)).toEqual([]);
});
it('retries a lost response using the saved choice without offering a replacement',async()=>{
 m.choose.mockRejectedValueOnce(new Error('Lost response'));render(<Controls characterId={c} declarationId={id}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Warp · within 30 ft of you'}));await screen.findByRole('alert');
 expect(screen.queryByRole('button',{name:'Push / pull · 20 ft'})).toBeNull();expect(pendingPropelMovements(c)[0].choice).toBe('warp');
 fireEvent.click(screen.getByRole('button',{name:'Confirm saved movement'}));await screen.findByTestId('propel-movement');expect(m.choose.mock.calls[0]).toEqual(m.choose.mock.calls[1]);
});
it('does not send a choice if storage cannot preserve it',async()=>{
 render(<Controls characterId={c} declarationId={id}/>);const button=await screen.findByRole('button',{name:'Warp · within 30 ft of you'});
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage unavailable');});fireEvent.click(button);await screen.findByRole('alert');expect(m.choose).not.toHaveBeenCalled();
});
it('closing preserves a concurrent confirmed Warp instead of claiming no movement',async()=>{
 m.close.mockResolvedValue({...row,movement_choice:{choice:'warp',feet:30}});render(<Controls characterId={c} declarationId={id}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Close without moving'}));await waitFor(()=>expect(screen.getByTestId('propel-movement').textContent).toContain('Teleport'));
});
