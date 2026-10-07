// Development-only fixture: real Pixi grid renderer, no database or image requests.
import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Application,Graphics} from 'pixi.js';
import {Viewport} from 'pixi-viewport';
import {mapResolution} from '../../src/components/Campaign/battlemap/mapResolution';
import {GridOverlay} from '../../src/components/Campaign/battlemap/GridOverlay';
import {useGridAppearance} from '../../src/lib/stores/gridAppearanceStore';
import '../../src/styles/globals.css';
function Fixture(){
 const host=useRef<HTMLDivElement>(null);
 const [viewport,setViewport]=useState<Viewport|null>(null);
 useEffect(()=>{
  const app=new Application();let stopped=false;
  void app.init({width:320,height:320,background:0xbca98e,antialias:true,resolution:mapResolution(320,320,window.devicePixelRatio),autoDensity:true,preserveDrawingBuffer:true}).then(()=>{
   if(stopped){app.destroy(true);return;}
   host.current!.appendChild(app.canvas);
   const vp=new Viewport({screenWidth:320,screenHeight:320,worldWidth:1400,worldHeight:1400,events:app.renderer.events});
   app.stage.addChild(vp);setViewport(vp);
   // A token remains above the grid even after zoom redraw/restyling.
   const token=new Graphics().circle(35,35,14).fill(0x2563eb);token.zIndex=10;vp.sortableChildren=true;vp.addChild(token);
   Object.assign(window,{gridFixture:{
    zoom:(scale:number)=>{vp.setZoom(scale,false);vp.moveCorner(0,0);},
    major:(majorLines:boolean)=>useGridAppearance.getState().setAppearance({majorLines}),
    pixels:()=>{app.render();const copy=document.createElement('canvas');copy.width=320;copy.height=320;const ctx=copy.getContext('2d')!;ctx.drawImage(app.canvas,0,0,320,320);return Array.from(ctx.getImageData(0,0,320,320).data);},
    gridCount:()=>vp.children.filter(c=>c.label==='map-grid').length,
   }});
  });
  return()=>{stopped=true;if(app.renderer)app.destroy(true);};
 },[]);
 return <main style={{padding:12}}><h1>Map grid</h1><p>One-pixel minor grid at every zoom.</p>
 <div style={{display:'flex',gap:8,marginBottom:12}}>{[0.5,1,4].map(scale=><button key={scale} onClick={()=>{viewport?.setZoom(scale,false);viewport?.moveCorner(0,0);}}>{scale*100}%</button>)}</div>
 <div ref={host}/><GridOverlay viewport={viewport} widthCells={20} heightCells={20} gridSizePx={70}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
