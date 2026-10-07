import {expect,test} from '@playwright/test';
test.use({serviceWorkers:'block'});
test('grid stays thin when zoomed and redraws without duplicating layers',async({page,context,baseURL},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
 await page.goto('/e2e/fixtures/map-grid.html');
 await page.waitForFunction(()=>!!(window as any).gridFixture);
 for(const scale of [1,4,0.5,4]) {
  await page.evaluate(scale=>(window as any).gridFixture.zoom(scale),scale);
  // Rendering assertions examine actual canvas pixels, not stroke-style fields.
  const thickness=()=>page.evaluate(scale=>{
   const data=(window as any).gridFixture.pixels() as number[];
   const x=Math.round(70*scale),y=Math.round(20*scale);
   return Array.from({length:13},(_,i)=>data[(y*320+x+i-6)*4]).filter(r=>r<175).length;
  },scale);
  await expect.poll(thickness).toBeGreaterThan(0);
  await expect.poll(thickness).toBeLessThanOrEqual(2);
  await expect.poll(()=>page.evaluate(()=>(window as any).gridFixture.gridCount())).toBe(1);
  await page.screenshot({path:info.outputPath(`grid-${scale}.png`)});
 }
 await page.evaluate(()=>(window as any).gridFixture.major(false));
 await page.evaluate(()=>(window as any).gridFixture.zoom(1));
 await expect.poll(()=>page.evaluate(()=>(window as any).gridFixture.gridCount())).toBe(1);
 expect(errors).toEqual([]);
});
