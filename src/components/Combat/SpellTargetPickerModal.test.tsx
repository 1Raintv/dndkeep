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
it('v2.746 — "Select within 20ft" picks only the near living target; a dead one in the area is listed last, marked IN AREA, unchecked until clicked',async()=>{
  // Sphere of 20 ft = 4 cells; grid is 70 px. Caster at cell 0, near goblin
  // at cell 1, far goblin at cell 8, dead goblin at cell 2 (inside the area).
  vi.mocked(declareMultiTargetAttack).mockClear();
  const rows=[
    {id:'near',name:'Goblin Near',participant_type:'creature',entity_id:'goblin',combatant_id:'near',current_hp:7,max_hp:7,is_dead:false},
    {id:'far',name:'Goblin Far',participant_type:'creature',entity_id:'goblin',combatant_id:'far',current_hp:7,max_hp:7,is_dead:false},
    {id:'dead',name:'Goblin Dead',participant_type:'creature',entity_id:'goblin',combatant_id:'dead',current_hp:0,max_hp:7,is_dead:true},
  ];
  const {supabase}=await import('../../lib/supabase');
  (supabase as any).from=(table:string)=>{
    const query={select:()=>query,eq:()=>query,
      maybeSingle:async()=>({data:table==='combat_encounters'?{id:'enc'}:{id:'hero',combatant_id:'hero-instance'}}),
      order:async()=>({data:rows}),
    };return query;
  };
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
    hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero',combatantId:'hero-instance'} as Token,
    near:{id:'near',x:105,y:35,size:'medium',creatureId:'goblin',combatantId:'near',name:'Goblin Near'} as Token,
    far:{id:'far',x:595,y:35,size:'medium',creatureId:'goblin',combatantId:'far',name:'Goblin Far'} as Token,
    dead:{id:'dead',x:175,y:35,size:'medium',creatureId:'goblin',combatantId:'dead',name:'Goblin Dead'} as Token,
  }});
  render(<SpellTargetPickerModal open onClose={()=>{}} onDeclared={vi.fn()} campaignId="c" character={{id:'hero',name:'Hero'} as Character}
    spell={{name:'Fireball',range:'150 feet',level:3,save_type:'DEX',damage_type:'fire',area_of_effect:{type:'sphere',size:20}} as SpellData} slotLevel={3} effectiveDamageDice="8d6" saveDC={14}/>);
  const near=await screen.findByRole('checkbox',{name:/Goblin Near/}) as HTMLInputElement;
  const far=screen.getByRole('checkbox',{name:/Goblin Far/}) as HTMLInputElement;
  const dead=screen.getByRole('checkbox',{name:/Goblin Dead/}) as HTMLInputElement;
  const labels=Array.from(document.querySelectorAll('label[data-target-group]'));
  expect(labels.map(l=>l.getAttribute('data-target-group'))).toEqual(['hostile','hostile','dead']);
  expect(labels[2].textContent).toContain('Goblin Dead');
  const button=await screen.findByRole('button',{name:'Select within 20ft'}) as HTMLButtonElement;
  await waitFor(()=>expect(button.disabled).toBe(false));
  fireEvent.click(button);
  expect(near.checked).toBe(true);expect(far.checked).toBe(false);expect(dead.checked).toBe(false);
  expect(labels[2].querySelector('[data-in-area]')).not.toBeNull();
  fireEvent.click(dead);expect(dead.checked).toBe(true);
});
it('v2.746 — a nearer party member is listed under ALLIES below the enemies, never as an enemy (caster is not in the list)',async()=>{
  // Regression: `self` was passed as a bare id while the caster row had been
  // filtered out, so the ranker had no side to measure against and Nyx (5 ft)
  // ranked above every goblin under an "Enemies" header.
  vi.mocked(declareMultiTargetAttack).mockClear();
  const rows=[
    {id:'nyx',name:'Nyx',participant_type:'character',entity_id:'nyx-char',combatant_id:'nyx',current_hp:20,max_hp:20,is_dead:false},
    {id:'g1',name:'Goblin A',participant_type:'creature',entity_id:'goblin',combatant_id:'g1',current_hp:7,max_hp:7,is_dead:false},
    {id:'g2',name:'Goblin B',participant_type:'creature',entity_id:'goblin',combatant_id:'g2',current_hp:7,max_hp:7,is_dead:false},
    {id:'gd',name:'Goblin Dead',participant_type:'creature',entity_id:'goblin',combatant_id:'gd',current_hp:0,max_hp:7,is_dead:true},
  ];
  const {supabase}=await import('../../lib/supabase');
  (supabase as any).from=(table:string)=>{
    const query={select:()=>query,eq:()=>query,
      maybeSingle:async()=>({data:table==='combat_encounters'?{id:'enc'}:{id:'hero',combatant_id:'hero-instance'}}),
      order:async()=>({data:rows}),
    };return query;
  };
  useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
    hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero',combatantId:'hero-instance'} as Token,
    nyx:{id:'nyx',x:105,y:35,size:'medium',characterId:'nyx-char',combatantId:'nyx',name:'Nyx'} as Token,
    g1:{id:'g1',x:595,y:35,size:'medium',creatureId:'goblin',combatantId:'g1',name:'Goblin A'} as Token,
    g2:{id:'g2',x:665,y:35,size:'medium',creatureId:'goblin',combatantId:'g2',name:'Goblin B'} as Token,
    gd:{id:'gd',x:175,y:35,size:'medium',creatureId:'goblin',combatantId:'gd',name:'Goblin Dead'} as Token,
  }});
  render(<SpellTargetPickerModal open onClose={()=>{}} onDeclared={vi.fn()} campaignId="c" character={{id:'hero',name:'Hero'} as Character}
    spell={{name:'Fireball',range:'150 feet',level:3,save_type:'DEX',damage_type:'fire',area_of_effect:{type:'sphere',size:20}} as SpellData} slotLevel={3} effectiveDamageDice="8d6" saveDC={14}/>);
  await screen.findByRole('checkbox',{name:/Nyx/});
  const labels=Array.from(document.querySelectorAll('label[data-target-group]'));
  expect(labels.map(l=>l.getAttribute('data-target-group'))).toEqual(['hostile','hostile','ally','dead']);
  expect(labels.map(l=>l.textContent?.replace(/\s+/g,' '))).toEqual([
    expect.stringContaining('Goblin A'),expect.stringContaining('Goblin B'),expect.stringContaining('Nyx'),expect.stringContaining('Goblin Dead'),
  ]);
  const headers=Array.from(document.querySelectorAll('[data-target-group-header]')).map(h=>h.getAttribute('data-target-group-header'));
  expect(headers).toEqual(['hostile','ally','dead']);
});
