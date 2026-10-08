// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MapConditionChip} from './MapConditionChip';
afterEach(cleanup);
it('names apply/remove buttons and submits one activation',()=>{
 const onActivate=vi.fn(),view=render(<MapConditionChip condition="Stunned" action="Apply" onActivate={onActivate}/>);
 fireEvent.click(screen.getByRole('button',{name:'Apply Stunned'}));expect(onActivate).toHaveBeenCalledTimes(1);
 view.rerender(<MapConditionChip condition="Stunned" action="Remove" disabled onActivate={onActivate}/>);fireEvent.click(screen.getByRole('button',{name:'Remove Stunned'}));expect(onActivate).toHaveBeenCalledTimes(1);
});
it('renders player conditions as noninteractive readable badges',()=>{render(<MapConditionChip condition="Unconscious"/>);expect(screen.getByText('Unconscious')).toBeTruthy();expect(screen.queryByRole('button')).toBeNull();});
