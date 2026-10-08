import {expect,type Page} from '@playwright/test';
/** The real fixed controls must clear combat/navigation and remain clickable. */
export async function assertFloatingToolsClear(page:Page,inCombat:boolean,screenshotPath?:(name:string)=>string){
 const obstruction=page.locator(inCombat?'.initiative-strip':'.mobile-bottom-nav');
 if(inCombat)await expect(obstruction).toBeVisible();
 for(const selector of ['.quickroll-fab','.rolllog-fab']){
  const button=page.locator(selector);await expect(button).toBeVisible();
  if(await obstruction.isVisible())await expect.poll(async()=>{const a=await obstruction.boundingBox(),b=await button.boundingBox();return a&&b?a.y-b.y-b.height:-1;}).toBeGreaterThanOrEqual(8);
  await button.click();const panel=page.locator(selector.replace('-fab','-panel'));await expect(panel).toBeVisible();
  await expect.poll(async()=>{const r=await panel.boundingBox(),b=await button.boundingBox();const size=page.viewportSize();return !!r&&!!b&&!!size&&r.x>=7&&r.y>=7&&r.x+r.width<=size.width-7&&r.y+r.height<=b.y-4;}).toBe(true);
  if(screenshotPath)await page.screenshot({path:screenshotPath(selector.slice(1)+'-panel.png')});
  await button.click();await expect(panel).toHaveCount(0);
 }
}
