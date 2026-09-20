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
