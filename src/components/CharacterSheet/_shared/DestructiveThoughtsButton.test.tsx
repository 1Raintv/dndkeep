// @vitest-environment happy-dom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({roll:vi.fn(()=>2),log:vi.fn(),toast:vi.fn(),load:vi.fn(),queue:vi.fn()}));
vi.mock('../../../rules/dice',()=>({rollDie:mocks.roll}));
vi.mock('../../../lib/gameUtils',()=>({computeStats:(c:{intelligence:number})=>({modifiers:{intelligence:Math.floor((c.intelligence-10)/2)}})}));
vi.mock('../../../lib/api/psionicDamage',()=>({loadPsionicDamageContext:mocks.load,queuePsionicDamage:mocks.queue}));
vi.mock('../../shared/ActionLog',()=>({logAction:mocks.log}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:mocks.toast})}));
vi.mock('../../Combat/TargetPickerModal',()=>({default:({onPick}:{onPick:(p:unknown)=>void})=><button onClick={()=>onPick({id:'target',name:'Goblin',participant_type:'creature'})}>Pick Goblin</button>}));
import RealDestructiveThoughtsButton from './DestructiveThoughtsButton';
import {withTestPsionicPersistence} from './psionicPersistence.testSupport';
const DestructiveThoughtsButton=withTestPsionicPersistence(RealDestructiveThoughtsButton);
import {ModalProvider} from '../../shared/Modal';
import type {Character} from '../../../types';
const character={id:'psion',name:'Psion',class_name:'Psion',level:5,intelligence:18,class_resources:{'psion-disciplines':['Destructive Thoughts'],'psionic-energy-dice':6,other:9}} as unknown as Character;
const ui=(c:Character,update:ReturnType<typeof vi.fn>)=><ModalProvider><DestructiveThoughtsButton character={c} onUpdate={update}/></ModalProvider>;
afterEach(cleanup);beforeEach(()=>{vi.clearAllMocks();mocks.load.mockResolvedValue(null);mocks.queue.mockResolvedValue(undefined);mocks.log.mockResolvedValue(undefined);});
async function choose(count:string){
 fireEvent.click(screen.getByRole('button',{name:'Roll damage'}));await screen.findByRole('dialog',{name:'Destructive Thoughts target'});
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Goblin'}});fireEvent.click(screen.getByRole('button',{name:'Choose target'}));
 await screen.findByRole('dialog',{name:'Destructive Thoughts'});fireEvent.change(screen.getByRole('textbox'),{target:{value:count}});fireEvent.click(screen.getByRole('button',{name:'Spend and roll'}));
}
it('spends chosen dice once and logs damage plus Intelligence once, without changing target HP',async()=>{
 const update=vi.fn();render(ui(character,update));await choose('3');
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('10 Psychic'));
 expect(update).toHaveBeenCalledTimes(1);expect(update).toHaveBeenCalledWith({class_resources:{...character.class_resources,'psionic-energy-dice':3}});
 expect(mocks.queue).not.toHaveBeenCalled();expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({targetName:'Goblin',total:10,individualResults:[2,2,2]}));
});
it.each(['0','5','1.5','no'])('rejects invalid count %s without cost',async count=>{
 const update=vi.fn();render(ui(character,update));await choose(count);await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());expect(update).not.toHaveBeenCalled();expect(mocks.roll).not.toHaveBeenCalled();
});
it('cancelling target selection costs nothing',async()=>{
 const update=vi.fn();render(ui(character,update));fireEvent.click(screen.getByRole('button',{name:'Roll damage'}));await screen.findByRole('dialog');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Roll damage'}) as HTMLButtonElement).disabled).toBe(false));expect(update).not.toHaveBeenCalled();
});
it('supports last-die Surge for every low roll at one Hit Point Die',async()=>{
 const update=vi.fn();render(ui({...character,level:7,hit_dice_spent:0,class_resources:{...character.class_resources,'psionic-energy-dice':2}},update));await choose('2');
 await screen.findByRole('dialog',{name:'Psionic Surge'});fireEvent.click(screen.getByRole('button',{name:'Spend 1 Hit Point Die'}));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('12 Psychic'));
 expect(update).toHaveBeenCalledTimes(2);expect(update).toHaveBeenLastCalledWith({hit_dice_spent:1});
});
it('retries a failed delivery with the same paid result and no second charge',async()=>{
 mocks.load.mockResolvedValue({campaignId:'camp',encounterId:'enc',self:{id:'self'},participants:[]});mocks.queue.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
 const update=vi.fn();render(ui({...character,campaign_id:'camp'},update));fireEvent.click(screen.getByRole('button',{name:'Roll damage'}));fireEvent.click(await screen.findByRole('button',{name:'Pick Goblin'}));
 await screen.findByRole('dialog',{name:'Destructive Thoughts'});fireEvent.click(screen.getByRole('button',{name:'Spend and roll'}));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Not queued'));const first=mocks.queue.mock.calls[0][0];
 fireEvent.click(screen.getByRole('button',{name:'Retry queue'}));await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Queued in combat'));
 expect(mocks.queue).toHaveBeenLastCalledWith(first);expect(update).toHaveBeenCalledTimes(1);expect(mocks.roll).toHaveBeenCalledTimes(1);
});

it('rechecks available dice after the confirmation opens',async()=>{
 const update=vi.fn();const view=render(ui(character,update));
 fireEvent.click(screen.getByRole('button',{name:'Roll damage'}));await screen.findByRole('dialog',{name:'Destructive Thoughts target'});
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Goblin'}});fireEvent.click(screen.getByRole('button',{name:'Choose target'}));await screen.findByRole('dialog',{name:'Destructive Thoughts'});
 view.rerender(ui({...character,class_resources:{...character.class_resources,'psionic-energy-dice':0}},update));
 fireEvent.click(screen.getByRole('button',{name:'Spend and roll'}));await waitFor(()=>expect(mocks.toast).toHaveBeenCalled());expect(update).not.toHaveBeenCalled();expect(mocks.roll).not.toHaveBeenCalled();
});
it('preserves a paid roll in history when the sheet closes during Surge',async()=>{
 const update=vi.fn();const view=render(ui({...character,level:7,hit_dice_spent:0},update));await choose('2');await screen.findByRole('dialog',{name:'Psionic Surge'});view.unmount();
 await waitFor(()=>expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({actionName:'Destructive Thoughts',total:8})));
 expect(update).toHaveBeenCalledTimes(1);expect(mocks.queue).not.toHaveBeenCalled();
});
it('does not hold a paid tabletop result behind history delivery',async()=>{
 mocks.log.mockReturnValue(new Promise(()=>{}));const update=vi.fn();render(ui(character,update));await choose('1');
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('6 Psychic'));expect((screen.getByRole('button',{name:'Roll damage'}) as HTMLButtonElement).disabled).toBe(false);
});
