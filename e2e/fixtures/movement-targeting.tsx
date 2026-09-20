// Isolated UI fixture: no campaign or database writes.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import TargetPickerModal from '../../src/components/Combat/TargetPickerModal';
import {useBattleMapStore,type Token} from '../../src/lib/stores/battleMapStore';
import {beginTokenMove} from '../../src/components/Campaign/battlemap/pendingTokenMoves';
import type {CombatParticipant} from '../../src/types';
import '../../src/styles/globals.css';

useBattleMapStore.setState({currentSceneId:'fixture',tokens:{g:{id:'g',x:105,y:35,size:'medium'} as Token}});
const release=beginTokenMove(['g'])!;
Object.assign(window,{finishMovement:release});
function Fixture(){
  const [picked,setPicked]=useState('');
  return <><span data-testid="picked">{picked}</span><TargetPickerModal
    participants={[{id:'g',name:'Goblin',participant_type:'creature',ac:15,current_hp:7,max_hp:7} as CombatParticipant]}
    onPick={p=>setPicked(p.id)} onCancel={()=>{}}/></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
