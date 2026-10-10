// Isolated real Pixi preview; no database writes.
import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Application,Graphics} from 'pixi.js';
import {Viewport} from 'pixi-viewport';
import {ReachOverlayLayer} from '../../src/components/Campaign/battlemap/ReachOverlayLayer';
import {useTargetReachPreview} from '../../src/components/Campaign/battlemap/useTargetReachPreview';
import {GridOverlay} from '../../src/components/Campaign/battlemap/GridOverlay';
import {useBattleMapStore} from '../../src/lib/stores/battleMapStore';
import type {ActiveBattleMap,ParticipantForTokenLookup} from '../../src/lib/battleMapGeometry';
import '../../src/styles/globals.css';
const actor:ParticipantForTokenLookup={name:'Hero',id:'hero',entity_id:'hero',participant_type:'character'};
const map={id:'scene',grid_size:30,tokens:[{id:'token',character_id:'hero',row:5,col:5,size:1}]} as ActiveBattleMap;
useBattleMapStore.setState({currentSceneId:'scene',loading:false});
function Fixture(){
 const host=useRef<HTMLDivElement>(null),[viewport,setViewport]=useState<Viewport|null>(null),[reach,setReach]=useState(5),[enabled,setEnabled]=useState(true);
 useTargetReachPreview(map,actor,reach,enabled);
 useEffect(()=>{
  const app=new Application();let stopped=false;
  void app.init({width:330,height:330,background:0x18202b,resolution:1,antialias:true,preserveDrawingBuffer:true}).then(()=>{
   if(stopped){app.destroy(true);return;}host.current!.appendChild(app.canvas);
   const vp=new Viewport({screenWidth:330,screenHeight:330,worldWidth:330,worldHeight:330,events:app.renderer.events});
   app.stage.addChild(vp);const token=new Graphics();token.circle(165,165,10).fill(0x60a5fa);vp.addChild(token);setViewport(vp);
   Object.assign(window,{reachFixture:{scene:(id:string)=>useBattleMapStore.setState({currentSceneId:id}),pixels:()=>{
    app.render();const canvas=document.createElement('canvas');canvas.width=330;canvas.height=330;const ctx=canvas.getContext('2d')!;ctx.drawImage(app.canvas,0,0);return Array.from(ctx.getImageData(0,0,330,330).data);
   }}});
  });return()=>{stopped=true;if(app.renderer)app.destroy(true);};
 },[]);
 return <main style={{padding:12}}><h1>Melee reach</h1><p>Reach follows the attack's current allowance.</p>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}><button onClick={()=>setReach(5)}>5 ft</button><button onClick={()=>setReach(10)}>10 ft</button><button onClick={()=>setEnabled(false)}>Close preview</button></div>
 <div ref={host}/><GridOverlay viewport={viewport} widthCells={11} heightCells={11} gridSizePx={30}/><ReachOverlayLayer viewport={viewport} gridSizePx={30}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
