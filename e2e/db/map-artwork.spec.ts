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
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        return vp.children.some((c:any)=>c.texture?.width===700 && c.texture?.height===700);
      })).toBe(true);
      await page.screenshot({path:info.outputPath('artwork-applied.png')});
      await expect(page.getByRole('button',{name:'Change Map',exact:true})).toBeVisible();expect(errors).toEqual([]);
    } finally {
      await page.evaluate(async id=>{const path='/src/lib/supabase.ts';const {supabase}=await import(/* @vite-ignore */ path);const {data}=await supabase.from('scenes').select('background_storage_path').eq('id',id).single();if(data?.background_storage_path)await supabase.storage.from('battlemap-assets').remove([data.background_storage_path]);await supabase.from('scenes').delete().eq('id',id);},scene!.id);
    }
  });
});
