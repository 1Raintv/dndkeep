// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('./useMapControlClearance',()=>({useMapControlClearance:vi.fn()}));
import {PartyVitalsBar,PARTY_PANEL_COLLAPSED_KEY} from './PartyVitalsBar';
const characters=[{id:'hero',name:'Nyx',current_hp:8,max_hp:20,armor_class:15}] as any;
afterEach(cleanup);beforeEach(()=>localStorage.clear());
it('exposes a named native focus button and HP/AC',()=>{
 const focus=vi.fn();render(<PartyVitalsBar characters={characters} onCharacterClick={focus}/>);
 const button=screen.getByRole('button',{name:'Focus Nyx on map'});fireEvent.click(button);
 expect(focus).toHaveBeenCalledWith('hero');expect(button.textContent).toContain('AC 15');expect(button.textContent).toContain('8 / 20');
});
it('keeps noninteractive cards noninteractive and persists collapse',()=>{
 const {unmount}=render(<PartyVitalsBar characters={characters}/>);
 expect(screen.queryByRole('button',{name:'Focus Nyx on map'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Collapse party panel'}));expect(localStorage.getItem(PARTY_PANEL_COLLAPSED_KEY)).toBe('1');
 unmount();render(<PartyVitalsBar characters={characters}/>);expect(screen.queryByText('Nyx')).toBeNull();
 fireEvent.click(screen.getByTitle('Show party vitals'));expect(screen.getByText('Nyx')).toBeTruthy();
});
it('hides an empty panel',()=>{render(<PartyVitalsBar characters={[]}/>);expect(screen.queryByRole('region')).toBeNull();});
