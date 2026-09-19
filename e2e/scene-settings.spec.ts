import {test,expect} from '@playwright/test';

test.describe('scene settings without a database',()=>{
  test.use({serviceWorkers:'block'});
  test.beforeEach(async({context,baseURL})=>{
    // Fail closed: fixtures may load Vite modules, but cannot reach any backend.
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin
      ? route.continue() : route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  });
  test('invalid drafts never write; failed saves preserve edits for retry',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    let release!:()=>void;const pending=new Promise<void>(r=>release=r);
    const patches:Record<string,unknown>[]=[];
    await page.route('**/rest/v1/scenes?**',async route=>{
      expect(route.request().method()).toBe('PATCH');patches.push(route.request().postDataJSON());
      if(patches.length===1)await pending;
      await route.fulfill({status:200,contentType:'application/json',body:patches.length===1?'[]':'[{"id":"scene-fixture"}]'});
    });
    await page.goto('/e2e/fixtures/scene-settings.html');
    await page.getByRole('button',{name:'Open scene settings'}).click();
    const dialog=page.getByRole('dialog',{name:'Scene settings',exact:true});
    const save=dialog.getByRole('button',{name:'Save',exact:true});
    for(const [label,value,message] of [
      ['Grid size in pixels','5','Grid size must be a whole number between 10 and 500 pixels.'],
      ['Width in cells','201','Width must be a whole number between 1 and 200 cells.'],
      ['Height in cells','1.5','Height must be a whole number between 1 and 200 cells.'],
      ['Width in cells','','Width must be a whole number between 1 and 200 cells.'],
    ]){
      const field=dialog.getByRole('spinbutton',{name:label});const original=await field.inputValue();
      await field.fill(value);await save.click();
      await expect(field).toHaveValue(value);
      await expect(dialog.getByRole('alert')).toHaveText(message);
      await expect(dialog.getByRole('alert')).toBeFocused();
      await expect(dialog.getByRole('alert')).toBeInViewport({ratio:1});
      await expect(save).toBeInViewport({ratio:1});expect(patches).toHaveLength(0);
      if(value==='1.5')await page.screenshot({path:info.outputPath('invalid-dimension.png')});
      await field.fill(original);
    }
    try {
      await dialog.getByRole('textbox',{name:'Scene name'}).fill('Updated watchtower');
      await dialog.getByRole('spinbutton',{name:'Width in cells'}).fill('32');
      await save.click();await expect.poll(()=>patches.length).toBe(1);
      await expect(dialog.getByRole('textbox')).toBeDisabled();
      await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
      release();
      await expect(dialog.getByRole('alert')).toContainText('could not be saved');
      await expect(dialog.getByRole('textbox')).toHaveValue('Updated watchtower');
      await expect(page.getByTestId('saved-patch')).toHaveText('{}');
      await save.click();await expect(dialog).toBeHidden();
      expect(patches).toHaveLength(2);
      expect(patches[1]).toMatchObject({name:'Updated watchtower',grid_size_px:70,width_cells:32,height_cells:15});
      await expect(page.getByTestId('saved-patch')).toContainText('"widthCells":32');
      expect(errors).toEqual([]);
    } finally {release();}
  });
  test('short-screen controls, nested confirmation and deletion recovery',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    let deletes=0;
    await page.route('**/rest/v1/scenes?**',async route=>{
      expect(route.request().method()).toBe('DELETE');deletes++;
      await route.fulfill({status:200,contentType:'application/json',body:deletes===1?'[]':'[{"id":"scene-fixture"}]'});
    });
    await page.setViewportSize({width:page.viewportSize()!.width,height:480});
    await page.goto('/e2e/fixtures/scene-settings.html');
    await page.getByRole('button',{name:'Open scene settings'}).click();
    const dialog=page.getByRole('dialog',{name:'Scene settings',exact:true});
    const name=dialog.getByRole('textbox',{name:'Scene name'});
    await expect(name).toBeFocused();await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button',{name:'Save',exact:true})).toBeFocused();
    for(const label of ['Delete Scene','Cancel','Save'])await expect(dialog.getByRole('button',{name:label,exact:true})).toBeInViewport({ratio:1});
    await name.fill('Unsaved draft');
    const remove=dialog.getByRole('button',{name:'Delete Scene',exact:true});
    await remove.click();
    const confirmation=page.getByRole('dialog').filter({hasText:'This removes the scene and all tokens'});
    await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(name).toHaveValue('Unsaved draft');expect(deletes).toBe(0);
    await remove.click();await confirmation.getByRole('button',{name:'Delete scene',exact:true}).click();
    await expect(dialog.getByRole('alert')).toContainText('could not be deleted');
    await expect(remove).toBeInViewport({ratio:1});
    await expect(page.getByTestId('deleted-scene')).toHaveText('');
    await page.screenshot({path:info.outputPath('delete-recovery.png')});
    await remove.click();await confirmation.getByRole('button',{name:'Delete scene',exact:true}).click();
    await expect(dialog).toBeHidden();await expect(page.getByTestId('deleted-scene')).toHaveText('scene-fixture');
    expect(deletes).toBe(2);expect(errors).toEqual([]);
  });
});
