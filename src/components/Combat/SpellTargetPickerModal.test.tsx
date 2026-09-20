// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import SpellTargetPickerModal from './SpellTargetPickerModal';
import {useBattleMapStore,type Token} from '../../lib/stores/battleMapStore';
import {beginTokenMove} from '../Campaign/battlemap/pendingTokenMoves';
import {declareMultiTargetAttack} from '../../lib/pendingAttack';
import type {Character,SpellData} from '../../types';
vi.mock('../../lib/supabase',()=>({supabase:{from:(table:string)=>{
  const query={select:()=>query,eq:()=>query,
    maybeSingle:async()=>({data:table==='combat_encounters'?{id:'enc'}:{id:'hero',combatant_id:'hero-instance'}}),
    order:async()=>({data:[{id:'g',name:'Goblin',participant_type:'creature',entity_id:'goblin',combatant_id:'two',current_hp:7,max_hp:7}]}),
  };return query;
}}}));
vi.mock('../../lib/battleMapGeometry',async original=>({...await original<object>(),loadActiveBattleMap:vi.fn().mockResolvedValue({id:'s',grid_size:70,tokens:[],walls:[]})}));
vi.mock('../../lib/pendingAttack',()=>({declareMultiTargetAttack:vi.fn().mockResolvedValue([{id:'attack'}])}));
vi.mock('../shared/ActionLog',()=>({logAction:vi.fn().mockResolvedValue(undefined)}));
afterEach(()=>{cleanup();vi.clearAllMocks();useBattleMapStore.setState({currentSceneId:null,tokens:{},remoteDragLocks:{},dragging:null});});
it.each([false,true])('waits before spending a spell and uses final instance distance (rollback=%s)',async rollback=>{
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
    hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero',combatantId:'hero-instance'} as Token,
    one:{id:'one',x:105,y:35,size:'medium',creatureId:'goblin',combatantId:'one',name:'Goblin'} as Token,
    two:{id:'two',x:595,y:35,size:'medium',creatureId:'goblin',combatantId:'two',name:'Goblin'} as Token,
  }});
  const spent=vi.fn();
  render(<SpellTargetPickerModal open onClose={()=>{}} onDeclared={spent} campaignId="c" character={{id:'hero',name:'Hero'} as Character}
    spell={{name:'Test spell',range:'30 feet',level:1,save_type:'DEX',damage_type:'fire'} as SpellData} slotLevel={1} effectiveDamageDice="2d6" saveDC={14}/>);
  const target=await screen.findByRole('checkbox',{name:/Goblin/});
  await waitFor(()=>expect(screen.getByText(/40ft · OOR/)).toBeTruthy());
  fireEvent.click(target);
  const declare=screen.getByRole('button',{name:'Declare vs 1'}) as HTMLButtonElement;
  let release:()=>void=()=>{};
  try {
    act(()=>{release=beginTokenMove(['two'])!;useBattleMapStore.getState().updateTokenPosition('two',105,35);});
    expect(declare.disabled).toBe(true);expect(screen.getByRole('status').textContent).toContain('Waiting');
    fireEvent.click(declare);expect(declareMultiTargetAttack).not.toHaveBeenCalled();expect(spent).not.toHaveBeenCalled();
    act(()=>{if(rollback)useBattleMapStore.getState().updateTokenPosition('two',595,35);release();});
    expect(declare.disabled).toBe(false);expect((target as HTMLInputElement).checked).toBe(true);
    expect(declareMultiTargetAttack).not.toHaveBeenCalled();expect(spent).not.toHaveBeenCalled();
    if(rollback)expect(screen.getByText(/40ft · OOR/)).toBeTruthy();
    else expect(screen.getByText(/· 5 ft/)).toBeTruthy();
    // Spells retain explicit manual selection: area victims may lie beyond cast range.
    fireEvent.click(declare);await waitFor(()=>expect(spent).toHaveBeenCalledTimes(1));
    expect(declareMultiTargetAttack).toHaveBeenCalledTimes(1);
    expect(vi.mocked(declareMultiTargetAttack).mock.calls[0][0].targets[0].participantId).toBe('g');
  }finally{act(release);}
});
