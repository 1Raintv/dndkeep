// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MultiTargetSavePicker} from './MultiTargetSavePicker';
import {useBattleMapStore,type Token} from '../../lib/stores/battleMapStore';
import {useLiveBattleMap} from '../../lib/hooks/useLiveBattleMap';
import {beginTokenMove} from '../Campaign/battlemap/pendingTokenMoves';
import type {ActiveBattleMap} from '../../lib/battleMapGeometry';
import type {CombatParticipant} from '../../types';
vi.mock('../../lib/supabase',()=>({supabase:{}}));
const actor={id:'hero',name:'Hero',participant_type:'character',entity_id:'hero'} as CombatParticipant;
const target={id:'g',name:'Goblin',participant_type:'creature',entity_id:'goblin',combatant_id:'two'} as CombatParticipant;
const map={id:'s',grid_size:70,walls:[],tokens:[]} as unknown as ActiveBattleMap;
afterEach(()=>{cleanup();useBattleMapStore.setState({currentSceneId:null,tokens:{},remoteDragLocks:{},dragging:null});});
it.each([false,true])('keeps choices and revalidates range after a move (outOfRange=%s)',outOfRange=>{
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
    hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero'} as Token,
    g:{id:'g',x:105,y:35,size:'medium',creatureId:'goblin',combatantId:'two'} as Token,
  }});
  const confirm=vi.fn();
  function Fixture(){return <MultiTargetSavePicker attackerParticipant={actor} participants={[target]} action={{name:'Fear'}} rangeFt={5} liveBattleMap={useLiveBattleMap(map)} onConfirm={confirm} onCancel={()=>{}}/>;}
  render(<Fixture/>);fireEvent.click(screen.getByRole('button',{name:/Goblin/}));
  const save=screen.getByRole('button',{name:'Save 1 target'}) as HTMLButtonElement;
  let release:()=>void=()=>{};
  try {
    act(()=>{release=beginTokenMove(['g'])!;useBattleMapStore.getState().updateTokenPosition('g',175,35);});
    expect(save.disabled).toBe(true);fireEvent.click(save);expect(confirm).not.toHaveBeenCalled();
    act(()=>{useBattleMapStore.getState().updateTokenPosition('g',outOfRange?595:105,35);release();});
    expect(confirm).not.toHaveBeenCalled();expect(save.disabled).toBe(outOfRange);
    if(outOfRange){
      expect(screen.getByRole('alert').textContent).toContain('no longer available or in range');
      fireEvent.click(save);expect(confirm).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button',{name:/Goblin/}));
      expect(screen.queryByRole('alert')).toBeNull();
      expect((screen.getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(true);
    }else{fireEvent.click(save);expect(confirm).toHaveBeenCalledWith([target]);}
  }finally{act(release);}
});
it('v2.746 — no Lock button; "Select all in range" skips the dead row, which is still tickable by hand',()=>{
  const dead={id:'d',name:'Corpse',participant_type:'creature',entity_id:'goblin',combatant_id:'three',is_dead:true,current_hp:0,max_hp:7} as CombatParticipant;
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
    hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero'} as Token,
    g:{id:'g',x:105,y:35,size:'medium',creatureId:'goblin',combatantId:'two'} as Token,
    d:{id:'d',x:105,y:105,size:'medium',creatureId:'goblin',combatantId:'three'} as Token,
  }});
  const confirm=vi.fn();
  function Fixture(){return <MultiTargetSavePicker attackerParticipant={actor} participants={[dead,target]} action={{name:'Fear'}} rangeFt={5} liveBattleMap={useLiveBattleMap(map)} onConfirm={confirm} onCancel={()=>{}}/>;}
  render(<Fixture/>);
  expect(screen.queryByRole('button',{name:/Lock/})).toBeNull();
  const rows=Array.from(document.querySelectorAll('button[data-target-group]')) as HTMLButtonElement[];
  expect(rows.map(r=>r.getAttribute('data-target-group'))).toEqual(['hostile','dead']);
  fireEvent.click(screen.getByRole('button',{name:/Select all in range/}));
  expect(screen.getByText('1 selected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:/Corpse/}));
  expect(screen.getByText('2 selected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Save 2 targets'}));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect((confirm.mock.calls[0][0] as CombatParticipant[]).map(p=>p.id).sort()).toEqual(['d','g']);
});
