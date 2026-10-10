// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),review:vi.fn()}));
vi.mock('../../lib/api/attackSaves',()=>({ATTACK_SAVE_CHANGED:'save-changed',savedAttackSave:m.read,reviewAttackSave:m.review}));
import SavedAttackSaveControls from './SavedAttackSaveControls';
beforeEach(()=>{vi.clearAllMocks();m.read.mockReturnValue({dice:[12],baseBonus:2});m.review.mockResolvedValue(undefined);});
afterEach(cleanup);
it('shows saved dice and requires a separate review without settling',async()=>{
 render(<SavedAttackSaveControls attackId="attack" bonus={5} disabled={false}/>);expect(screen.getByRole('status').textContent).toContain('d20 12 · bonus 2');
 fireEvent.click(screen.getByRole('button',{name:'Review changed settings'}));await waitFor(()=>expect(m.review).toHaveBeenCalledWith('attack',5));
});
it('a failed review remains visible and can be retried',async()=>{
 m.review.mockRejectedValueOnce(new Error('Settings unavailable'));render(<SavedAttackSaveControls attackId="attack" bonus={0} disabled={false}/>);
 const button=screen.getByRole('button');fireEvent.click(button);expect((await screen.findByRole('alert')).textContent).toContain('Settings unavailable');await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
});
it('no saved throw adds no recovery controls',()=>{
 m.read.mockReturnValue(null);render(<SavedAttackSaveControls attackId="attack" bonus={0} disabled={false}/>);expect(screen.queryByRole('button')).toBeNull();
});
