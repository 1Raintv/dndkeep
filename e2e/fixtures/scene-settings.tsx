// Development-only fixture: imports the real dialog; Playwright intercepts every API request.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SceneSettingsModal} from '../../src/components/Campaign/battlemap/SceneSettingsModal';
import {ModalProvider} from '../../src/components/shared/Modal';
import type {Scene} from '../../src/lib/api/scenes';
import '../../src/styles/globals.css';

const scene:Scene={id:'scene-fixture',campaignId:'campaign-fixture',ownerId:'owner-fixture',name:'Ruined watchtower',
  gridType:'square',gridSizePx:70,widthCells:20,heightCells:15,backgroundStoragePath:null,dmNotes:null,
  isPublished:true,ambientLight:'dark',fogMode:'dynamic',revealedCells:[],exploredCells:[],createdAt:'',updatedAt:''};
function Fixture(){
  const [open,setOpen]=useState(false);
  const [patch,setPatch]=useState<Partial<Scene>>({});
  const [deleted,setDeleted]=useState('');
  return <ModalProvider>
    <button onClick={()=>setOpen(true)}>Open scene settings</button>
    <output data-testid="saved-patch">{JSON.stringify(patch)}</output>
    <output data-testid="deleted-scene">{deleted}</output>
    {open && <SceneSettingsModal scene={scene} onClose={()=>setOpen(false)} onScenePatched={setPatch} onSceneDeleted={setDeleted}/>}
  </ModalProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
