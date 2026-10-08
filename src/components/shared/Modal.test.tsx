// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {useLayoutEffect} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {ModalProvider,useModal} from './Modal';
afterEach(cleanup);
let modal:ReturnType<typeof useModal>;
function Expose({immediate=false}:{immediate?:boolean}) {
 modal=useModal();
 useLayoutEffect(()=>{
  // A rendered control may be activated before passive effects have flushed.
  if(immediate&&document.getElementById('modal-title')?.textContent==='Immediate')
   document.querySelector<HTMLButtonElement>('[role="dialog"] button:last-child')?.click();
 });
 return null;
}
it('settles a replaced request even when both are opened before a render',async()=>{
 const first=vi.fn(),second=vi.fn();render(<ModalProvider><Expose/></ModalProvider>);
 act(()=>{void modal.confirm({title:'First'}).then(first);void modal.confirm({title:'Second'}).then(second);});
 await waitFor(()=>expect(first).toHaveBeenCalledWith(false));
 expect(screen.getByRole('dialog',{name:'Second'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'OK'}));
 await waitFor(()=>expect(second).toHaveBeenCalledWith(true));
 expect(first).toHaveBeenCalledTimes(1);expect(second).toHaveBeenCalledTimes(1);
});
it('can confirm a newly rendered request before passive effects',async()=>{
 const settled=vi.fn();render(<ModalProvider><Expose immediate/></ModalProvider>);
 act(()=>{void modal.confirm({title:'Immediate'}).then(settled);});
 await waitFor(()=>expect(settled).toHaveBeenCalledWith(true));
 expect(screen.queryByRole('dialog')).toBeNull();
});
it('a replacement prompt resets input even with the same title',async()=>{
 const first=vi.fn(),second=vi.fn();render(<ModalProvider><Expose/></ModalProvider>);
 act(()=>{void modal.prompt({title:'Name',defaultValue:'first'}).then(first);});
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'edited'}});
 act(()=>{void modal.prompt({title:'Name',defaultValue:'second'}).then(second);});
 expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('second');
 await waitFor(()=>expect(first).toHaveBeenCalledWith(null));
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(second).toHaveBeenCalledWith('second'));
});
it('unmount cancels a pending request once',async()=>{
 const settled=vi.fn();const view=render(<ModalProvider><Expose/></ModalProvider>);
 act(()=>{void modal.confirm({title:'Pending'}).then(settled);});view.unmount();
 await waitFor(()=>expect(settled).toHaveBeenCalledWith(false));expect(settled).toHaveBeenCalledTimes(1);
});

it('a delayed click on an old dialog cannot answer its replacement',async()=>{
 const first=vi.fn(),second=vi.fn();render(<ModalProvider><Expose/></ModalProvider>);
 act(()=>{void modal.confirm({title:'Old'}).then(first);});
 const oldButton=screen.getByRole('button',{name:'OK'});
 act(()=>{void modal.confirm({title:'Replacement'}).then(second);oldButton.click();});
 await waitFor(()=>expect(first).toHaveBeenCalledWith(false));
 expect(second).not.toHaveBeenCalled();expect(screen.getByRole('dialog',{name:'Replacement'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'OK'}));await waitFor(()=>expect(second).toHaveBeenCalledWith(true));
});

it.each(['escape','replace','unmount'])('a decision dismissed by %s remains undecided',async mode=>{
 const settled=vi.fn();const view=render(<ModalProvider><Expose/></ModalProvider>);
 act(()=>{void modal.decide({title:'Outcome',confirmLabel:'Spend',cancelLabel:'Keep'}).then(settled);});
 if(mode==='escape')fireEvent.keyDown(window,{key:'Escape'});else if(mode==='unmount')view.unmount();else act(()=>{void modal.confirm({title:'Other'});});
 await waitFor(()=>expect(settled).toHaveBeenCalledWith(null));expect(settled).toHaveBeenCalledTimes(1);
});
it.each([['Spend',true],['Keep',false]] as const)('a decision explicitly answered %s returns %s',async(label,result)=>{
 const settled=vi.fn();render(<ModalProvider><Expose/></ModalProvider>);
 act(()=>{void modal.decide({title:'Outcome',confirmLabel:'Spend',cancelLabel:'Keep'}).then(settled);});
 fireEvent.click(screen.getByRole('button',{name:label}));await waitFor(()=>expect(settled).toHaveBeenCalledWith(result));
});
