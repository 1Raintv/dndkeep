// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../../types';
import TelepathReviewControls from './TelepathReviewControls';
const m=vi.hoisted(()=>({candidates:vi.fn(),context:vi.fn(),pending:vi.fn(),prepare:vi.fn(),send:vi.fn()}));
vi.mock('../../lib/api/reactionCharacter',()=>({loadTelepathCandidates:m.candidates}));
vi.mock('../../lib/api/telepathReactions',()=>({getTelepathAttackContext:m.context}));
vi.mock('../../lib/telepathRecovery',()=>({pendingTelepath:m.pending,prepareTelepath:m.prepare,sendTelepath:m.send}));
beforeEach(()=>{vi.clearAllMocks();m.candidates.mockResolvedValue([{id:'first',name:'First'},{id:'second',name:'Second'}]);m.pending.mockReturnValue(null);});
afterEach(cleanup);
const attack={id:'attack',campaign_id:'campaign',encounter_id:'encounter',hit_result:'hit'} as PendingAttack;
it('discards a delayed review after the selected Psion changes',async()=>{
 let resolve!:(value:unknown)=>void;m.context.mockReturnValue(new Promise(r=>resolve=r));
 render(<TelepathReviewControls attack={attack} disabled={false} onSaved={()=>{}} runAction={async task=>{await task();}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Review Psion reaction'}));await screen.findByRole('option',{name:'First'});
 fireEvent.change(screen.getByLabelText('Reacting Psion'),{target:{value:'first'}});await waitFor(()=>expect(m.context).toHaveBeenCalled());
 fireEvent.change(screen.getByLabelText('Reacting Psion'),{target:{value:'second'}});
 await act(async()=>resolve({subject:{self:false},telepathyRange:60}));
 expect(screen.queryByRole('button',{name:'Roll and save reaction'})).toBeNull();expect(m.prepare).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});
it('offers exact-request recovery before requesting a new context',async()=>{
 m.pending.mockReturnValue({kind:'finish',request:{declarationId:'saved'}});
 render(<TelepathReviewControls attack={attack} disabled={false} onSaved={()=>{}} runAction={async task=>{await task();}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Review Psion reaction'}));await screen.findByRole('option',{name:'First'});
 fireEvent.change(screen.getByLabelText('Reacting Psion'),{target:{value:'first'}});await screen.findByRole('button',{name:'Retry saved Telepath request'});
 expect(m.context).not.toHaveBeenCalled();expect(m.prepare).not.toHaveBeenCalled();
});
