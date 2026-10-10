// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const m=vi.hoisted(()=>({process:vi.fn(),queue:vi.fn(),done:vi.fn(),failed:vi.fn()}));
vi.mock('../../lib/api/auraResolution',()=>({processInteractiveAuraResolution:m.process}));
vi.mock('../../lib/api/movementAuraReviews',()=>({pendingMovementAuraReviews:m.queue,finishMovementAuraReview:vi.fn()}));
import {useAuraTurnReview} from './useAuraTurnReview';
import type {AuraSaveInput} from '../../lib/auras';
const input={encounterId:'enc',targetParticipantId:'target',trigger:'turn_end',aura:{originParticipantId:'origin',spec:{key:'aura'}}} as AuraSaveInput;
const snapshot={aura:{aura:{name:'Aura',saveAbility:'WIS',saveDC:14,damageDice:null}},save:{autoFail:false},target:{combatant:{name:'Target'},participant:{participant_type:'creature'}}};
function Harness({scope='enc'}:{scope?:string}){const aura=useAuraTurnReview(scope);return <>{aura.dialog}<button onClick={()=>void aura.resolve(input,{userId:'dm',turnId:'turn',guard:()=>{}}).then(m.done,m.failed)}>End</button></>;}
beforeEach(()=>{vi.resetAllMocks();m.queue.mockResolvedValue([{event:{id:'event',capturedAt:'2026-10-10T00:00:00Z',context:{}},plan:{candidates:[],warnings:[]}}]);m.process.mockImplementation(async(_user,_identity,_trigger,reviewInputs,_reviewResult,guard)=>{const result=await reviewInputs(snapshot);guard();if(!result)throw new Error('postponed');return {};});});
afterEach(cleanup);
it('postpones input review when its owning view unmounts',async()=>{
 const view=render(<Harness/>);fireEvent.click(screen.getByText('End'));await screen.findByRole('dialog');view.unmount();await waitFor(()=>expect(m.failed).toHaveBeenCalledTimes(1));expect(m.done).not.toHaveBeenCalled();
});
it('cancels the old encounter review on a scope change',async()=>{
 const view=render(<Harness/>);fireEvent.click(screen.getByText('End'));await screen.findByRole('dialog');view.rerender(<Harness scope="other"/>);
 await waitFor(()=>expect(m.failed).toHaveBeenCalledTimes(1));expect(screen.queryByRole('dialog')).toBeNull();expect(m.done).not.toHaveBeenCalled();
});

function MovementHarness({scope='enc'}:{scope?:string}){const aura=useAuraTurnReview(scope);return <>{aura.dialog}<button onClick={()=>void aura.reviewMovement(scope,'dm',()=>{}).then(m.done,m.failed)}>Review move</button></>;}
it('postpones movement review when its view unmounts',async()=>{
 const view=render(<MovementHarness/>);fireEvent.click(screen.getByText('Review move'));await screen.findByRole('dialog');view.unmount();await waitFor(()=>expect(m.failed).toHaveBeenCalledOnce());expect(m.done).not.toHaveBeenCalled();
});
it('scope changes cannot complete an old movement review',async()=>{
 const view=render(<MovementHarness/>);fireEvent.click(screen.getByText('Review move'));await screen.findByRole('dialog');view.rerender(<MovementHarness scope="other"/>);await waitFor(()=>expect(m.failed).toHaveBeenCalledOnce());expect(screen.queryByRole('dialog')).toBeNull();expect(m.done).not.toHaveBeenCalled();
});
