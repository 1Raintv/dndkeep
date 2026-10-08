// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../../types';
const m=vi.hoisted(()=>({preview:vi.fn(),apply:vi.fn()}));
vi.mock('../../lib/api/psionicDamageResolution',()=>({previewPsionicDamage:m.preview,applyPsionicDamagePlan:m.apply}));
import Panel from './PsionicDamageResolutionPanel';
const attack={id:'attack',damage_final:13,psionic_damage_dice:{version:1,sides:8,originalRolls:[1,5,3],rolls:[1,5,3],modifier:4}} as unknown as PendingAttack;
const plan={context:{attack},activations:[{id:'activation',total:8}],damageAfter:13,defensesKnown:true,usedThisTurn:false,pendingActivation:false,bypass:true,immune:false,replacement:null};
const mount=()=>render(<Panel attack={attack} disabled={false} runAction={async fn=>{await fn();}} onCancel={()=>{}}/>);
beforeEach(()=>{vi.clearAllMocks();m.preview.mockResolvedValue(plan);});afterEach(cleanup);
it('only submits after a verified preview and sends the selected replacement',async()=>{
 m.preview.mockImplementation(async(_id,choice)=>({...plan,choice,damageAfter:choice.activationId?20:13}));mount();await screen.findByText('Final Psychic damage: 13');
 fireEvent.change(screen.getByRole('combobox',{name:'Sharpened Mind replacement'}),{target:{value:'activation'}});await screen.findByText('Final Psychic damage: 20');
 fireEvent.click(screen.getByRole('button',{name:/Apply Damage/}));await waitFor(()=>expect(m.apply).toHaveBeenCalledWith(expect.objectContaining({choice:{activationId:'activation',dieIndex:0}})));
});
it('missing defenses block application until a DM choice produces a preview',async()=>{
 m.preview.mockResolvedValue({...plan,damageAfter:null,defensesKnown:false});mount();await screen.findByText(/conditional or missing/);
 expect((screen.getByRole('button',{name:/Apply Damage/}) as HTMLButtonElement).disabled).toBe(true);expect(m.apply).not.toHaveBeenCalled();
});
it('late previews cannot overwrite newer choices',async()=>{
 let finish!:(v:unknown)=>void;m.preview.mockImplementationOnce(()=>new Promise(r=>finish=r)).mockResolvedValueOnce({...plan,damageAfter:0});mount();
 fireEvent.change(screen.getByRole('combobox',{name:'Psychic defenses'}),{target:{value:'immune'}});await screen.findByText('Final Psychic damage: 0');
 await act(async()=>finish(plan));expect(screen.queryByText('Final Psychic damage: 13')).toBeNull();
});
it('failed preview keeps application disabled and offers refresh',async()=>{
 m.preview.mockRejectedValueOnce(new Error('Read failed')).mockResolvedValueOnce(plan);mount();await screen.findByRole('alert');expect((screen.getByRole('button',{name:/Apply Damage/}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Refresh damage'}));await screen.findByText('Final Psychic damage: 13');
});
