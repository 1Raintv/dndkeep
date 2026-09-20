// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import TargetPickerModal from './TargetPickerModal';
import {useBattleMapStore,type Token} from '../../lib/stores/battleMapStore';
import type {CombatParticipant} from '../../types';
import {beginTokenMove} from '../Campaign/battlemap/pendingTokenMoves';
vi.mock('../../lib/supabase',()=>({supabase:{}}));
vi.mock('../../lib/battleMapGeometry',async original=>({...await original<object>(),loadActiveBattleMap:vi.fn().mockResolvedValue({id:'s',grid_size:70,tokens:[]})}));
afterEach(()=>{cleanup();useBattleMapStore.setState({tokens:{},currentSceneId:null,dragging:null,remoteDragLocks:{}});});
it('gates the chosen creature instance and updates range immediately after a move',async()=>{
  const actor={id:'hero',name:'Hero',participant_type:'character',entity_id:'hero',combatant_id:'hero-instance'} as CombatParticipant;
  const target={id:'g2',name:'Goblin',participant_type:'creature',entity_id:'goblin',combatant_id:'two'} as CombatParticipant;
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
    hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero',combatantId:'hero-instance'} as Token,
    one:{id:'one',x:105,y:35,size:'medium',name:'Goblin',creatureId:'goblin',combatantId:'one'} as Token,
    two:{id:'two',x:595,y:35,size:'medium',name:'Goblin',creatureId:'goblin',combatantId:'two'} as Token,
  }});
  const pick=vi.fn();render(<TargetPickerModal participants={[target]} fromParticipant={actor} campaignId="c" maxRangeFt={5} onPick={pick} onCancel={vi.fn()}/>);
  const button=screen.getByRole('button',{name:/Goblin/}) as HTMLButtonElement;
  await waitFor(()=>expect(button.textContent).toContain('40 ft — out of range'));expect(button.disabled).toBe(true);
  fireEvent.click(button);expect(pick).not.toHaveBeenCalled();
  act(()=>useBattleMapStore.getState().updateTokenPosition('two',105,35));
  expect(button.textContent).toContain('5 ft');expect(button.disabled).toBe(false);
  fireEvent.click(button);expect(pick).toHaveBeenCalledWith(target);
});
it.each([false,true])('waits for the saved position before attacking (rollback=%s)',async rollback=>{
  const actor={id:'hero',name:'Hero',participant_type:'character',entity_id:'hero'} as CombatParticipant;
  const target={id:'g',name:'Goblin',participant_type:'creature',entity_id:'goblin'} as CombatParticipant;
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
    hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero'} as Token,
    g:{id:'g',x:595,y:35,size:'medium',creatureId:'goblin'} as Token,
  }});
  const pick=vi.fn();render(<TargetPickerModal participants={[target]} fromParticipant={actor} campaignId="c" maxRangeFt={5} onPick={pick} onCancel={vi.fn()}/>);
  const button=screen.getByRole('button',{name:/Goblin/}) as HTMLButtonElement;
  await waitFor(()=>expect(button.textContent).toContain('40 ft'));
  let release:()=>void=()=>{};
  try {
    act(()=>{release=beginTokenMove(['g'])!;useBattleMapStore.getState().updateTokenPosition('g',105,35);});
    expect(screen.getByRole('status').textContent).toContain('Waiting for token movement');
    expect(button.disabled).toBe(true);fireEvent.click(button);expect(pick).not.toHaveBeenCalled();
    act(()=>{if(rollback)useBattleMapStore.getState().updateTokenPosition('g',595,35);release();});
    expect(screen.queryByRole('status')).toBeNull();
    expect(button.disabled).toBe(rollback);expect(pick).not.toHaveBeenCalled();
    fireEvent.click(button);expect(pick).toHaveBeenCalledTimes(rollback?0:1);
  } finally {act(release);}
});
