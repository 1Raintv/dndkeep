import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import * as assets from '../../../lib/api/battleMapAssets';
import {setSceneBackground,type Scene} from '../../../lib/api/scenes';
import {artworkLayout,artworkRaster,type ArtworkFit} from './artworkLayout';
import './MapArtworkUpload.css';

/** v2.707 — review locally before upload. Baking padding/crop into the image
 * keeps existing scene coordinates and older clients compatible. */
export function MapArtworkUpload({scene,userId,onSaved}:{scene:Scene;userId:string;onSaved:(id:string,path:string)=>void}) {
  const input=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const generation=useRef(0),uploaded=useRef<string|null>(null);
  const mounted=useRef(true),saving=useRef(false);
  const [image,setImage]=useState<ImageBitmap|null>(null),[fit,setFit]=useState<ArtworkFit>('contain');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [gridOpacity,setGridOpacity]=useState(.25);
  const worldW=scene.widthCells*scene.gridSizePx,worldH=scene.heightCells*scene.gridSizePx;
  const raster=artworkRaster(worldW,worldH);
  const discard=()=>{const path=uploaded.current;uploaded.current=null;if(path)void assets.discardSceneBackground(path).catch(()=>{});};
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;generation.current++;if(!saving.current)discard();};},[]);
  useEffect(()=>()=>{image?.close();},[image]);
  useEffect(()=>{if(image) dialog.current?.showModal();},[image]);
  useEffect(()=>{
    if(!image || !canvas.current) return;
    const c=canvas.current;c.width=raster.width;c.height=raster.height;
    const ctx=c.getContext('2d')!;ctx.clearRect(0,0,c.width,c.height);
    const r=artworkLayout(image.width,image.height,c.width,c.height,fit);
    ctx.drawImage(image,r.x,r.y,r.width,r.height);
    discard();
  },[image,fit,raster.width,raster.height]);
  const close=()=>{if(!busy) {discard();setImage(null);setError('');}};
  async function pick(file?:File) {
    if(!file)return;const gen=++generation.current;setError('');
    if(!assets.ACCEPTED_PORTRAIT_MIME.includes(file.type) || file.size>assets.MAX_PORTRAIT_BYTES) {
      setError('Choose a PNG, JPEG, WebP or GIF up to 5 MB.');return;
    }
    try {const bitmap=await createImageBitmap(file);
      if(gen!==generation.current){bitmap.close();return;}
      setFit('contain');setImage(bitmap);
    } catch {if(gen===generation.current)setError('This image could not be opened. Try a different file.');}
  }
  async function save() {
    if(!image || !canvas.current || saving.current)return;saving.current=true;setBusy(true);setError('');
    try {
      let path=uploaded.current;
      if(!path) {
        const blob=await new Promise<Blob|null>(resolve=>canvas.current!.toBlob(resolve,'image/webp',.94));
        if(!blob || blob.size>assets.MAX_PORTRAIT_BYTES)throw new Error('The prepared image is too large. Try a smaller source image.');
        path=await assets.uploadSceneBackground(new File([blob],'map.webp',{type:blob.type}),userId,scene.id);
        if(!path)throw new Error('Upload failed. Your current map is unchanged. Try again.');
        uploaded.current=path;
      }
      if(!await setSceneBackground(scene.id,path))throw new Error('The image uploaded, but saving the map failed. Retry to finish saving.');
      onSaved(scene.id,path);setImage(null);uploaded.current=null;
    } catch(e) {setError(e instanceof Error ? e.message : 'Unable to save the map. Try again.');}
    finally {saving.current=false;if(!mounted.current)discard();setBusy(false);}
  }
  const enlarged=image && artworkLayout(image.width,image.height,worldW,worldH,fit).scale>1;
  return <>
    <button type="button" className="map-artwork-button" onClick={()=>input.current?.click()}>{scene.backgroundStoragePath?'Change Map':'Upload Map'}</button>
    <input ref={input} type="file" aria-label="Choose map artwork" accept={assets.ACCEPTED_PORTRAIT_MIME.join(',')} hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';void pick(f);}}/>
    {!image && error && <span role="alert">{error}</span>}
    {image && createPortal(<dialog ref={dialog} className="map-artwork-dialog" aria-labelledby="artwork-title" onCancel={e=>{e.preventDefault();close();}}>
      <h2 id="artwork-title">Preview map artwork</h2>
      <p>{image.width} × {image.height} pixels · {scene.widthCells} × {scene.heightCells} grid cells</p>
      <div className="map-artwork-preview"><canvas ref={canvas} aria-label="Prepared map artwork"/><div aria-hidden="true" className="map-artwork-grid" style={{opacity:gridOpacity,backgroundSize:`${100/scene.widthCells}% ${100/scene.heightCells}%`}}/></div>
      <label className="map-artwork-grid-control">Preview grid <input aria-label="Preview grid opacity" type="range" min="0" max="1" step="0.05" value={gridOpacity} onChange={e=>setGridOpacity(Number(e.target.value))}/></label>
      <fieldset disabled={busy}><legend>Image sizing</legend>
        <label><input type="radio" name="artwork-fit" checked={fit==='contain'} onChange={()=>setFit('contain')}/> Fit inside — keep the whole image</label>
        <label><input type="radio" name="artwork-fit" checked={fit==='cover'} onChange={()=>setFit('cover')}/> Fill and crop — cover the whole map</label>
      </fieldset>
      <p>Proportions stay intact. The preview grid is not baked into your image. Animated images import as a still frame.</p>
      {enlarged && <p className="map-artwork-quality" role="status">This image will be enlarged and may look soft when zoomed in. A larger original will look sharper.</p>}
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Apply artwork'}</button></footer>
    </dialog>,document.body)}
  </>;
}
