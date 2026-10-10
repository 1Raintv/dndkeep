import {createRoot} from 'react-dom/client';
import {PartyVitalsBar} from '../../src/components/Campaign/battlemap/PartyVitalsBar';
import '../../src/styles/globals.css';
createRoot(document.getElementById('root')!).render(<div style={{position:'relative',height:'100dvh',background:'#101217'}}>
 <PartyVitalsBar characters={[{id:'hero',name:'Nyx',current_hp:8,max_hp:20,armor_class:15}]} onCharacterClick={()=>{}}/>
</div>);
