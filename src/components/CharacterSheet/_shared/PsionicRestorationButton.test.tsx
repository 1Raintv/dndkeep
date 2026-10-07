// @vitest-environment happy-dom
import {useState} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ModalProvider} from '../../shared/Modal';
import PsionicRestorationButton from './PsionicRestorationButton';
import type {Character} from '../../../types';
import {CLASS_COMBAT_ABILITIES} from '../../../data/classAbilities';
// The ability catalog imports game helpers transitively; unit tests must not initialize a database client.
vi.mock('../../../lib/supabase',()=>({supabase:{}}));
const initial={id:'psion',class_name:'Psion',level:5,class_resources:{'psionic-energy-dice':2},feature_uses:{}} as unknown as Character;
afterEach(cleanup);
it('has a level-five limited-use Actions entry',()=>{
  expect(CLASS_COMBAT_ABILITIES.Psion.find(a=>a.name==='Psionic Restoration')).toMatchObject({minLevel:5,rest:'long',maxUses:1,actionType:'special'});
});
it('only refills after completing meditation, blocks repeats and survives remount',async()=>{
  const update=vi.fn();let latest=initial;
  function Fixture(){const [character,setCharacter]=useState(latest);return <ModalProvider><PsionicRestorationButton character={character} onUpdate={patch=>{update(patch);latest={...character,...patch};setCharacter(latest);}}/></ModalProvider>;}
  const mounted=render(<Fixture/>);
  fireEvent.click(screen.getByRole('button',{name:'Meditate (1 min)'}));
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Meditate (1 min)'}) as HTMLButtonElement).disabled).toBe(false));
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Meditate (1 min)'}));
  const complete=screen.getByRole('button',{name:'Complete meditation'});
  fireEvent.click(complete);fireEvent.click(complete);
  await waitFor(()=>expect(update).toHaveBeenCalledTimes(1));
  expect(latest.class_resources?.['psionic-energy-dice']).toBe(6);
  mounted.unmount();render(<Fixture/>);
  expect((screen.getByRole('button',{name:'Used · Long Rest'}) as HTMLButtonElement).disabled).toBe(true);
});
it('rechecks current resources after the confirmation was opened',async()=>{
  const update=vi.fn();const view=render(<ModalProvider><PsionicRestorationButton character={initial} onUpdate={update}/></ModalProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Meditate (1 min)'}));
  view.rerender(<ModalProvider><PsionicRestorationButton character={{...initial,feature_uses:{'Psionic Restoration':1}}} onUpdate={update}/></ModalProvider>);
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Complete meditation'})));
  expect(update).not.toHaveBeenCalled();
});
