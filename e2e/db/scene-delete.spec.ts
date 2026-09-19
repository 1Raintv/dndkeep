import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';

test.describe('scene deletion recovery',()=>{
  gateDbSuite();test.use({serviceWorkers:'block'});
  test('failed deletion preserves drafts, blocks competing actions and allows retry',async({page},info)=>{
    test.setTimeout(60_000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await signInAsSeedDm(page);
    const title=`Delete fixture ${Date.now()}`;
    const scene=await page.evaluate(async name=>{
      const path='/src/lib/api/scenes.ts';const api=await import(/* @vite-ignore */ path);
      return api.createScene('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',{name,widthCells:10,heightCells:10});
    },title);
    expect(scene).toBeTruthy();
    const route='**/rest/v1/scenes?**';
    let release!:()=>void;const pending=new Promise<void>(r=>release=r);let deletes=0,patches=0;
    try {
      await page.goto('/campaigns');await page.getByText('Local Test Campaign',{exact:true}).locator('visible=true').first().click();
      await page.locator('select').filter({has:page.locator('option',{hasText:title})}).selectOption({label:title});
      await page.locator('button[title^="Scene settings"]').first().click();
      const settings=page.getByRole('dialog',{name:'Scene settings',exact:true});
      const name=settings.getByRole('textbox',{name:'Scene name'});
      await name.fill(title+' draft');
      await page.route(route,async r=>{
        if(r.request().method()==='PATCH')patches++;
        if(r.request().method()==='DELETE'){deletes++;await pending;await r.fulfill({status:200,contentType:'application/json',body:'[]'});}else await r.continue();
      });
      await settings.getByRole('button',{name:'Delete Scene',exact:true}).click();
      const confirmation=page.getByRole('dialog').filter({hasText:'This removes the scene and all tokens'});
      await confirmation.getByRole('button',{name:'Delete scene',exact:true}).click();
      await expect.poll(()=>deletes).toBe(1);
      await expect(name).toBeDisabled();
      await expect(settings.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
      await expect(settings.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled();
      // Programmatic clicks also cannot bypass the synchronous reservation.
      await settings.getByRole('button',{name:'Save',exact:true}).dispatchEvent('click');
      await settings.getByRole('button',{name:'Deleting…',exact:true}).dispatchEvent('click');
      await page.keyboard.press('Escape');await expect(settings).toBeVisible();
      await page.screenshot({path:info.outputPath('scene-deleting.png')});
      release();
      await expect(page.getByText('Scene could not be deleted. Your edits are still here. Try again.',{exact:true})).toBeVisible();
      await expect(settings.getByRole('alert')).toBeFocused();
      await expect(settings.getByRole('alert')).toBeInViewport();
      await expect(name).toBeEnabled();await expect(name).toHaveValue(title+' draft');
      expect(deletes).toBe(1);expect(patches).toBe(0);
      await expect(page.locator('option').filter({hasText:title})).toHaveCount(1);
      await page.screenshot({path:info.outputPath('scene-delete-retry.png')});
      await page.unroute(route);
      // Retry against the real local database, deleting only this disposable scene.
      await settings.getByRole('button',{name:'Delete Scene',exact:true}).click();
      await confirmation.getByRole('button',{name:'Delete scene',exact:true}).click();
      await expect(settings).toBeHidden();
      await expect(page.locator('option').filter({hasText:title})).toHaveCount(0);
      const remaining=await page.evaluate(async id=>{
        const path='/src/lib/supabase.ts';const {supabase}=await import(/* @vite-ignore */ path);
        const {data,error}=await supabase.from('scenes').select('id').eq('id',id);if(error)throw error;return data;
      },scene!.id);
      expect(remaining).toEqual([]);expect(errors).toEqual([]);
    } finally {
      release();await page.unroute(route);
      await page.evaluate(async id=>{const path='/src/lib/api/scenes.ts';const api=await import(/* @vite-ignore */ path);await api.deleteScene(id);},scene!.id);
    }
  });
});
