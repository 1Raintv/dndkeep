// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Character,ComputedStats} from '../../types';
const m=vi.hoisted(()=>({read:vi.fn(),roll:vi.fn(),history:vi.fn(),done:vi.fn()}));
vi.mock('../../lib/supabase',()=>({supabase:{}}));
vi.mock('../../lib/api/psionicDisciplines',()=>({getPsionicGuardsSaveAdvantage:m.read}));
vi.mock('../../lib/characterHistory',()=>({logHistoryEvent:m.history}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:m.roll})}));
import SavePromptBanner from './SavePromptBanner';
const character={id:'hero',user_id:'owner'} as Character;
const computed={saving_throws:{intelligence:{total:7,proficient:true},dexterity:{total:-1,proficient:false}}} as ComputedStats;
const prompt={ability:'Intelligence',dc:18};
const view=(p=prompt,c=character)=><SavePromptBanner character={c} computed={computed} userId="owner" prompt={p} onRolled={m.done}/>;
const click=()=>fireEvent.click(screen.getByRole('button',{name:'Roll Save'}));
beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue(false);m.history.mockResolvedValue(undefined);});afterEach(cleanup);
it('checks Guards at roll time and logs both d20s with the actual save modifier',async()=>{
 m.read.mockResolvedValue(true);render(view());click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));
 expect(m.read).toHaveBeenCalledWith('hero','intelligence');const event=m.roll.mock.calls[0][0];
 expect(event).toMatchObject({advantage:true,modifier:7,label:'Intelligence Save (DC 18) (Advantage · Psionic Guards)'});
 event.onResult([{die:20,value:3},{die:20,value:12}],19);
 expect(m.history).toHaveBeenCalledWith(expect.objectContaining({newValue:19,description:'Intelligence save DC 18: 3 or 12 (keep highest; Psionic Guards) +7 = 19 — SUCCESS'}));expect(m.done).toHaveBeenCalledTimes(1);
});
it('returns to a normal save when Guards expires',async()=>{
 render(view());click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));expect(m.roll.mock.calls[0][0]).toMatchObject({advantage:false,modifier:7});
});
it('recognizes abbreviated ability prompts and uses the computed equipment/proficiency bonus',async()=>{
 render(view({ability:'INT',dc:18}));click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));expect(m.read).toHaveBeenCalledWith('hero','intelligence');expect(m.roll.mock.calls[0][0].modifier).toBe(7);
});
it('records standard save success from total, including a natural 20 that still misses DC',async()=>{
 render(view({ability:'Dexterity',dc:20}));click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));m.roll.mock.calls[0][0].onResult([{die:20,value:20}],19);
 expect(m.history).toHaveBeenCalledWith(expect.objectContaining({description:'Dexterity save DC 20: 20 -1 = 19 — FAIL'}));
});
it('keeps the prompt on lookup failure and allows retry',async()=>{
 m.read.mockRejectedValueOnce(new Error('Protection unavailable'));render(view());click();await screen.findByRole('alert');expect(m.roll).not.toHaveBeenCalled();expect(m.done).not.toHaveBeenCalled();
 click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));expect(screen.queryByRole('alert')).toBeNull();
});
it('does not issue duplicate lookups while busy',async()=>{
 let resolve!:(value:boolean)=>void;m.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));render(view());click();fireEvent.click(screen.getByRole('button'));
 expect(m.read).toHaveBeenCalledTimes(1);await act(async()=>resolve(true));expect(m.roll).toHaveBeenCalledTimes(1);
});
it('ignores an old response when a newer DM prompt arrives, even with the same ability and DC',async()=>{
 let resolve!:(value:boolean)=>void;m.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const result=render(view());click();result.rerender(view({...prompt}));
 await act(async()=>resolve(true));expect(m.roll).not.toHaveBeenCalled();expect(m.done).not.toHaveBeenCalled();click();await waitFor(()=>expect(m.roll).toHaveBeenCalledTimes(1));
});
it('ignores responses after switching characters',async()=>{
 let resolve!:(value:boolean)=>void;m.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const result=render(view());click();result.rerender(view(prompt,{...character,id:'other'}));
 await act(async()=>resolve(true));expect(m.roll).not.toHaveBeenCalled();expect(m.done).not.toHaveBeenCalled();
});
it('ignores responses after unmounting',async()=>{
 let resolve!:(value:boolean)=>void;m.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const result=render(view());click();result.unmount();await act(async()=>resolve(true));expect(m.roll).not.toHaveBeenCalled();
});
it('rejects invalid prompts instead of silently inventing an ability modifier',()=>{
 const result=render(view({ability:'Luck',dc:18}));click();expect(screen.getByRole('alert')).toBeTruthy();expect(m.read).not.toHaveBeenCalled();
 result.rerender(view({ability:'Intelligence',dc:NaN}));click();expect(m.roll).not.toHaveBeenCalled();
});
