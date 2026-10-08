import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';

test.describe('map artwork preview',()=>{
  gateDbSuite();test.use({serviceWorkers:'block'});
  test('preview, cancel and retry preserve the scene until artwork saves',async({page},info)=>{
    test.setTimeout(60_000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await signInAsSeedDm(page);
    const name=`Artwork fixture ${Date.now()}`;
    const scene=await page.evaluate(async name=>{
      const path='/src/lib/api/scenes.ts';const api=await import(/* @vite-ignore */ path);
      return api.createScene('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',{name,widthCells:10,heightCells:10});
    },name);
    expect(scene).toBeTruthy();
    try {
      await page.goto('/campaigns');await page.getByText('Local Test Campaign',{exact:true}).locator('visible=true').first().click();
      await page.locator('select').filter({has:page.locator('option',{hasText:name})}).selectOption({label:name});
      const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=200;const ctx=c.getContext('2d')!;ctx.fillStyle='#457ca6';ctx.fillRect(0,0,400,200);ctx.fillStyle='#e8c36b';ctx.beginPath();ctx.arc(200,100,60,0,Math.PI*2);ctx.fill();return c.toDataURL().split(',')[1];});
      const file={name:'wide-map.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
      let uploads=0;page.on('request',r=>{if(r.method()==='POST' && r.url().includes('/storage/v1/object/battlemap-assets/'))uploads++;});
      await page.getByLabel('Choose map artwork').setInputFiles(file);
      const dialog=page.getByRole('dialog',{name:'Preview map artwork'});
      await expect(dialog).toBeVisible();await expect(dialog.getByRole('status')).toContainText('may look soft');
      const alpha=()=>dialog.locator('canvas').evaluate(c=>(c as HTMLCanvasElement).getContext('2d')!.getImageData(1,1,1,1).data[3]);
      expect(await alpha()).toBe(0);
      await dialog.getByLabel('Fill and crop',{exact:false}).check();await expect.poll(alpha).toBe(255);
      await dialog.getByLabel('Fit inside',{exact:false}).check();await expect.poll(alpha).toBe(0);
      const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(10);expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize()!.width-10);
      expect((await dialog.getByRole('radio').first().boundingBox())!.width).toBeLessThanOrEqual(24);
      await dialog.getByLabel('Preview grid opacity').fill('0');await expect(dialog.locator('.map-artwork-grid')).toHaveCSS('opacity','0');
      await dialog.getByLabel('Preview grid opacity').fill('0.5');await expect(dialog.locator('.map-artwork-grid')).toHaveCSS('opacity','0.5');
      expect(await alpha()).toBe(0); // preview grid never changes exported pixels
      await page.screenshot({path:info.outputPath('artwork-preview.png')});
      await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toBeHidden();expect(uploads).toBe(0);
      await page.getByLabel('Choose map artwork').setInputFiles(file);await expect(dialog).toBeVisible();
      let denied=false;
      await page.route('**/rest/v1/scenes*',async route=>{
        if(route.request().method()==='PATCH' && !denied) {denied=true;await route.fulfill({status:200,contentType:'application/json',body:'[]'});}else await route.continue();
      });
      await dialog.getByRole('button',{name:'Apply artwork'}).click();
      await expect(dialog.getByRole('alert')).toContainText('Retry');expect(uploads).toBe(1);
      await dialog.getByRole('button',{name:'Apply artwork'}).click();await expect(dialog).toBeHidden();expect(uploads).toBe(1);
      const saved=await page.evaluate(async id=>{const path='/src/lib/supabase.ts';const {supabase}=await import(/* @vite-ignore */ path);const {data}=await supabase.from('scenes').select('background_storage_path,width_cells,height_cells').eq('id',id).single();return data;},scene!.id);
      expect(saved.background_storage_path).toBeTruthy();expect([saved.width_cells,saved.height_cells]).toEqual([10,10]);
      await expect.poll(()=>page.evaluate(()=>{
        const vp=(window as any).__PIXI_APP__?.stage.children.find((c:any)=>c.plugins);
        return vp?.children.some((c:any)=>c.texture?.width===700 && c.texture?.height===700);
      })).toBe(true);
      await page.screenshot({path:info.outputPath('artwork-applied.png')});
      await expect(page.getByRole('button',{name:'Change Map',exact:true})).toBeVisible();expect(errors).toEqual([]);
    } finally {
      await page.evaluate(async id=>{const path='/src/lib/supabase.ts';const {supabase}=await import(/* @vite-ignore */ path);const {data}=await supabase.from('scenes').select('background_storage_path').eq('id',id).single();if(data?.background_storage_path)await supabase.storage.from('battlemap-assets').remove([data.background_storage_path]);await supabase.from('scenes').delete().eq('id',id);},scene!.id);
    }
  });
  test('high-resolution artwork keeps native detail without resizing the grid',async({page},info)=>{
    test.setTimeout(60_000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await signInAsSeedDm(page);
    const name=`HD artwork ${Date.now()}`;
    const scene=await page.evaluate(async name=>{
      const path='/src/lib/api/scenes.ts';const api=await import(/* @vite-ignore */ path);
      return api.createScene('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',{name,widthCells:10,heightCells:10});
    },name);
    expect(scene).toBeTruthy();
    try{
      await page.goto('/campaigns');await page.getByText('Local Test Campaign',{exact:true}).locator('visible=true').first().click();
      await page.locator('select').filter({has:page.locator('option',{hasText:name})}).selectOption({label:name});
      const png=await page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=2400;c.height=1200;const ctx=c.getContext('2d')!;
        ctx.fillStyle='#263648';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#e8c36b';ctx.lineWidth=2;
        for(let x=0;x<c.width;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c.height);ctx.stroke();}
        ctx.fillStyle='#d1dee8';ctx.font='bold 100px sans-serif';ctx.fillText('HIGH DETAIL MAP',150,600);
        return c.toDataURL().split(',')[1];
      });
      await page.getByLabel('Choose map artwork').setInputFiles({name:'hd-map.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
      const dialog=page.getByRole('dialog',{name:'Preview map artwork'});
      await expect(dialog).toBeVisible();await expect(dialog).toContainText('Saved image: 2400 × 2400 pixels.');
      const dimensions=()=>dialog.locator('canvas').evaluate(c=>[(c as HTMLCanvasElement).width,(c as HTMLCanvasElement).height]);
      expect(await dimensions()).toEqual([2400,2400]);
      await dialog.getByLabel('Fill and crop',{exact:false}).check();await expect.poll(dimensions).toEqual([1200,1200]);
      await dialog.getByLabel('Fit inside',{exact:false}).check();await expect.poll(dimensions).toEqual([2400,2400]);
      await expect(dialog.getByRole('status')).toHaveCount(0);
      await page.screenshot({path:info.outputPath('hd-artwork-preview.png')});
      await dialog.getByRole('button',{name:'Apply artwork'}).click();await expect(dialog).toBeHidden();
      const texture=()=>page.evaluate(()=>{
        const vp=(window as any).__PIXI_APP__?.stage.children.find((c:any)=>c.plugins);
        const sprite=vp?.children.find((c:any)=>c.texture?.width===2400&&c.texture?.height===2400);
        return sprite?{width:sprite.width,height:sprite.height}:null;
      });
      await expect.poll(texture).toEqual({width:700,height:700});
      const saved=await page.evaluate(async id=>{
        const path='/src/lib/supabase.ts';const {supabase}=await import(/* @vite-ignore */ path);
        const {data}=await supabase.from('scenes').select('width_cells,height_cells,grid_size_px,background_storage_path').eq('id',id).single();
        return data;
      },scene!.id);
      expect([saved.width_cells,saved.height_cells,saved.grid_size_px]).toEqual([10,10,70]);
      await page.reload();
      // Reload opens the campaign's default scene; explicitly return to this private fixture.
      await page.locator('select').filter({has:page.locator('option',{hasText:name})}).selectOption({label:name});
      await expect.poll(texture).toEqual({width:700,height:700});
      await page.getByTitle('Fullscreen map',{exact:true}).click();
      await page.getByRole('button',{name:'Fit map',exact:true}).click();
      await page.screenshot({path:info.outputPath('hd-artwork-applied.png')});expect(errors).toEqual([]);
    }finally{
      await page.evaluate(async id=>{const path='/src/lib/supabase.ts';const {supabase}=await import(/* @vite-ignore */ path);const {data}=await supabase.from('scenes').select('background_storage_path').eq('id',id).single();if(data?.background_storage_path)await supabase.storage.from('battlemap-assets').remove([data.background_storage_path]);await supabase.from('scenes').delete().eq('id',id);},scene!.id);
    }
  });

});
