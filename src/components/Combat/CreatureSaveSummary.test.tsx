// @vitest-environment happy-dom
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../../lib/api/creatureSaveDefinition',()=>({readCreatureSaveDefinition:m.read}));
import {CreatureSaveSummary,ParticipantSaveSummary} from './CreatureSaveSummary';
afterEach(()=>{cleanup();m.read.mockReset();});
it('displays listed totals, known zero, and unknowns distinctly',()=>{
 render(<CreatureSaveSummary definition={{saving_throws:{int:9},wis:10}}/>);
 expect(screen.getByLabelText('INT +9')).toBeTruthy();expect(screen.getByLabelText('WIS +0')).toBeTruthy();expect(screen.getByLabelText('STR review needed')).toBeTruthy();expect(screen.getByText('Review missing save data before rolling.')).toBeTruthy();
});
it('hides stale bonuses while a different actor loads and ignores late replies',async()=>{
 let finishA!:(value:unknown)=>void,finishB!:(value:unknown)=>void;
 m.read.mockImplementationOnce(()=>new Promise(resolve=>{finishA=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{finishB=resolve;}));
 const a={id:'a',campaign_id:'camp',entity_id:'a',combatant_id:'ca'},b={...a,id:'b',entity_id:'b',combatant_id:'cb'};
 const view=render(<ParticipantSaveSummary participant={a}/>);view.rerender(<ParticipantSaveSummary participant={b}/>);
 await act(async()=>{finishB({saving_throws:{int:9}});});await waitFor(()=>expect(screen.getByLabelText('INT +9')).toBeTruthy());
 await act(async()=>{finishA({saving_throws:{int:1}});});expect(screen.queryByLabelText('INT +1')).toBeNull();expect(screen.getByLabelText('INT +9')).toBeTruthy();
});
it('read failure clears prior actor values and shows review instead of zero',async()=>{
 const a={id:'a',campaign_id:'camp',entity_id:'a',combatant_id:'ca'};m.read.mockResolvedValueOnce({saving_throws:{int:9}}).mockRejectedValueOnce(new Error('unavailable'));
 const view=render(<ParticipantSaveSummary participant={a}/>);await waitFor(()=>expect(screen.getByLabelText('INT +9')).toBeTruthy());
 view.rerender(<ParticipantSaveSummary participant={{...a,id:'b'}}/>);expect(screen.queryByLabelText('INT +9')).toBeNull();await waitFor(()=>expect(screen.getByLabelText('INT review needed')).toBeTruthy());
});
