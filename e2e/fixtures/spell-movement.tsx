// Real dialogs with intercepted API requests; never writes to a database.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import SpellTargetPickerModal from '../../src/components/Combat/SpellTargetPickerModal';
import {MultiTargetSavePicker} from '../../src/components/Combat/MultiTargetSavePicker';
import {useBattleMapStore,type Token} from '../../src/lib/stores/battleMapStore';
import {useLiveBattleMap} from '../../src/lib/hooks/useLiveBattleMap';
import {beginTokenMove} from '../../src/components/Campaign/battlemap/pendingTokenMoves';
import type {ActiveBattleMap} from '../../src/lib/battleMapGeometry';
import type {Character,CombatParticipant,SpellData} from '../../src/types';
import '../../src/styles/globals.css';
const actor={id:'hero',name:'Hero',participant_type:'character',entity_id:'hero'} as CombatParticipant;
const target={id:'g',name:'Goblin',participant_type:'creature',entity_id:'goblin',combatant_id:'two',current_hp:7,max_hp:7} as CombatParticipant;
const map={id:'s',grid_size:70,tokens:[],walls:[]} as unknown as ActiveBattleMap;
useBattleMapStore.setState({currentSceneId:'s',loading:false,tokens:{
  hero:{id:'hero',x:35,y:35,size:'medium',characterId:'hero'} as Token,
  one:{id:'one',x:105,y:35,size:'medium',creatureId:'goblin',combatantId:'one',name:'Goblin'} as Token,
  two:{id:'two',x:175,y:35,size:'medium',creatureId:'goblin',combatantId:'two',name:'Goblin'} as Token,
}});
let release=()=>{};
Object.assign(window,{
  startMove:()=>{release=beginTokenMove(['two'])!;useBattleMapStore.getState().updateTokenPosition('two',105,35);},
  finishMove:(x:number)=>{useBattleMapStore.getState().updateTokenPosition('two',x,35);release();},
});
function Fixture(){
  const [submitted,setSubmitted]=useState(0);
  const liveMap=useLiveBattleMap(map);
  return <><span data-testid="submitted">{submitted}</span>{location.search.includes('multi')?
    <MultiTargetSavePicker attackerParticipant={actor} participants={[target]} action={{name:'Frightful Presence',dc_type:'WIS',dc_value:14}} rangeFt={30} liveBattleMap={liveMap} onConfirm={()=>setSubmitted(n=>n+1)} onCancel={()=>{}}/>:
    <SpellTargetPickerModal open onClose={()=>{}} onDeclared={()=>setSubmitted(n=>n+1)} campaignId="c" character={{id:'hero',name:'Hero'} as Character}
      spell={{name:'Burning Hands',range:'30 feet',level:1,save_type:'DEX',damage_type:'fire'} as SpellData} slotLevel={1} effectiveDamageDice="3d6" saveDC={14}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
