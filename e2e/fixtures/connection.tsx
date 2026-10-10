import {createRoot} from 'react-dom/client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../src/lib/supabase';
import type {Character} from '../../src/types';
import ConnectionControls from '../../src/components/CharacterSheet/_shared/ConnectionControls';
import {ModalProvider} from '../../src/components/shared/Modal';
import {usePsionicEnhancements} from '../../src/lib/hooks/usePsionicEnhancements';
import {acceptPsionicEnergyReceipt,acceptPsionicHitDiceReceipt} from '../../src/lib/characterRealtime';
import '../../src/styles/globals.css';
const queue={flush:async()=>{},getSnapshot:()=>({pending:false,error:null})};
function Controls({initial}:{initial:Character}){
 const [character,setCharacter]=useState(initial),latest=useRef(character);latest.current=character;
 const persistence=usePsionicEnhancements(character.id,queue,receipt=>{
  if('remaining' in receipt)acceptPsionicEnergyReceipt(latest,receipt);
  else if('hitDiceSpent' in receipt)acceptPsionicHitDiceReceipt(latest,receipt as any);
  setCharacter({...latest.current});
 });
 return <ConnectionControls character={character} persistence={persistence}/>;
}
function App(){
 const [character,setCharacter]=useState<Character|null>(null);
 useEffect(()=>{void supabase.from('characters').select('*').eq('id',new URLSearchParams(location.search).get('character')!).single().then(({data})=>setCharacter(data));},[]);
 return <ModalProvider><main style={{padding:16,maxWidth:440,margin:'24px auto',boxSizing:'border-box'}}><h1 style={{fontSize:22}}>Telepathic Connection</h1>{character?<Controls initial={character}/>:<p>Loading character…</p>}</main></ModalProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
