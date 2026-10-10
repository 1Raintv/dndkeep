import {expect,test} from '@playwright/test';
test.use({serviceWorkers:'block'});
test('rendered melee reach expands, clears on close, and never crosses scenes',async({page,context,baseURL},info)=>{
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/e2e/fixtures/map-reach.html');await page.waitForFunction(()=>!!(window as any).reachFixture);
 const width=()=>page.evaluate(()=>{
  const data=(window as any).reachFixture.pixels() as number[],xs:number[]=[];
  for(let y=0;y<330;y++)for(let x=0;x<330;x++){const i=(y*330+x)*4;if(data[i]>data[i+2]+25)xs.push(x);}
  return xs.length?Math.max(...xs)-Math.min(...xs)+1:0;
 });
 await expect.poll(width).toBeGreaterThanOrEqual(90);expect(await width()).toBeLessThanOrEqual(94);
 await page.getByRole('button',{name:'10 ft',exact:true}).click();await expect.poll(width).toBeGreaterThanOrEqual(150);expect(await width()).toBeLessThanOrEqual(154);
 await expect(page.locator('canvas')).toBeInViewport({ratio:1});await page.screenshot({path:info.outputPath('extended-melee-reach.png')});
 await page.getByRole('button',{name:'Close preview'}).click();await expect.poll(width).toBe(0);
 await page.reload();await page.waitForFunction(()=>!!(window as any).reachFixture);await expect.poll(width).toBeGreaterThanOrEqual(90);
 await page.evaluate(()=>(window as any).reachFixture.scene('other'));await expect.poll(width).toBe(0);expect(errors).toEqual([]);
});
