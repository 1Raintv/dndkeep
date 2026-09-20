import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
for(const mode of ['spell','multi'])test(`${mode} targeting waits for movement and retains selections`,async({page,context,baseURL},info)=>{
  // Fixtures can read their fake encounter but all backend traffic is intercepted.
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===new URL(baseURL!).origin)return route.continue();
    let body:unknown={};
    if(url.pathname.endsWith('/combat_encounters'))body={id:'enc'};
    if(url.pathname.endsWith('/combat_participants'))body=url.searchParams.has('entity_id')?{id:'hero'}:
      [{id:'g',name:'Goblin',participant_type:'creature',entity_id:'goblin',combatant_id:'two',current_hp:7,max_hp:7}];
    if(url.pathname.endsWith('/scenes'))body={id:'s',grid_size_px:70,width_cells:20,height_cells:20};
    if(url.pathname.endsWith('/campaigns'))body={use_combatants_for_battlemap:false};
    if(/\/(scene_tokens|scene_walls|scene_token_placements)$/.test(url.pathname))body=[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`/e2e/fixtures/spell-movement.html?${mode}`);
  const target=page.getByRole(mode==='spell'?'checkbox':'button',{name:/Goblin/});
  await expect(page.getByText(/10 ft/)).toBeVisible();await target.click();
  const confirm=page.getByRole('button',{name:mode==='spell'?'Declare vs 1':'Save 1 target'});
  await page.evaluate(()=>(window as any).startMove());
  await expect(confirm).toBeDisabled();await expect(page.getByRole('status')).toContainText('Waiting');
  await confirm.dispatchEvent('click');await expect(page.getByTestId('submitted')).toHaveText('0');
  await expect(page.getByRole('status')).toBeInViewport({ratio:1});await expect(confirm).toBeInViewport({ratio:1});
  await page.screenshot({path:info.outputPath('waiting.png')});
  await page.evaluate(()=>(window as any).finishMove(595));
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByTestId('submitted')).toHaveText('0');
  if(mode==='spell'){
    await expect(target).toBeChecked();await expect(page.getByText('40ft · OOR')).toBeVisible();await expect(confirm).toBeEnabled();
  }else{
    await expect(confirm).toBeDisabled();await expect(page.getByRole('alert')).toContainText('no longer available or in range');
    await page.screenshot({path:info.outputPath('range-changed.png')});
    await target.click();await expect(page.getByRole('alert')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
