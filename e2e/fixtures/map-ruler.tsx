// Development-only fixture: real Pixi grid renderer, no database or image requests.
import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Application} from 'pixi.js';
import {Viewport} from 'pixi-viewport';
import {mapResolution} from '../../src/components/Campaign/battlemap/mapResolution';
import {GridOverlay} from '../../src/components/Campaign/battlemap/GridOverlay';
import {RulerLayer} from '../../src/components/Campaign/battlemap/RulerLayer';
import '../../src/styles/globals.css';
function Fixture(){
 const host=useRef<HTMLDivElement>(null);
 const [canvas,setCanvas]=useState<HTMLCanvasElement|null>(null);
 const [active,setActive]=useState(true);
 const [viewport,setViewport]=useState<Viewport|null>(null);
 useEffect(()=>{
  const app=new Application();let stopped=false;
  void app.init({width:320,height:320,background:0xbca98e,antialias:true,resolution:mapResolution(320,320,window.devicePixelRatio),autoDensity:true,preserveDrawingBuffer:true}).then(()=>{
   if(stopped){app.destroy(true);return;}
   host.current!.appendChild(app.canvas);setCanvas(app.canvas);
   const vp=new Viewport({screenWidth:320,screenHeight:320,worldWidth:1400,worldHeight:1400,events:app.renderer.events});
   app.stage.addChild(vp);setViewport(vp);
   Object.assign(window,{rulerFixture:{
    zoom:(scale:number)=>{vp.setZoom(scale,false);vp.moveCenter(175,35);},
    active:setActive,
    text:()=>vp.children.find(c=>c.label==='map-ruler')?.children.find(c=>c.label==='map-ruler-label')?.text,
    pixels:()=>{app.render();const copy=document.createElement('canvas');copy.width=320;copy.height=320;const ctx=copy.getContext('2d')!;ctx.drawImage(app.canvas,0,0,320,320);return Array.from(ctx.getImageData(0,0,320,320).data);},
    rulerCount:()=>vp.children.filter(c=>c.label==='map-ruler').length,
   }});
  });
  return()=>{stopped=true;if(app.renderer)app.destroy(true);};
 },[]);
 return <main style={{padding:12}}><h1>Map ruler</h1><p>Readable distances at every zoom.</p>
 <div style={{display:'flex',gap:8,marginBottom:12}}>{[0.5,1,4].map(scale=><button key={scale} onClick={()=>{viewport?.setZoom(scale,false);viewport?.moveCorner(0,0);}}>{scale*100}%</button>)}</div>
 <div ref={host}/><RulerLayer viewport={viewport} canvasEl={canvas} active={active} gridSizePx={70}/><GridOverlay viewport={viewport} widthCells={20} heightCells={20} gridSizePx={70}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
