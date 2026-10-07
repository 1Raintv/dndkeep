import {expect,test} from '@playwright/test';
test.use({serviceWorkers:'block'});
test('ruler text stays legible through toolbar zoom without changing distance',async({page,context,baseURL},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
 await page.goto('/e2e/fixtures/map-ruler.html');await page.waitForFunction(()=>!!(window as any).rulerFixture);
 const canvas=page.locator('canvas');await canvas.click({position:{x:35,y:35}});await canvas.click({position:{x:175,y:35}});
 let first:{width:number;height:number}|undefined;
 for(const scale of [1,0.25,4,1]) {
  await page.evaluate(scale=>(window as any).rulerFixture.zoom(scale),scale);
  const pixels=()=>page.evaluate(()=>{
   const data=(window as any).rulerFixture.pixels() as number[];const xs:number[]=[],ys:number[]=[];
   // Isolate gold label pixels below the tip; grid/background are not gold.
   for(let y=170;y<210;y++)for(let x=40;x<280;x++){
    const i=(y*320+x)*4;if(data[i]>180&&data[i+1]>120&&data[i+2]<100){xs.push(x);ys.push(y);}
   }
   return {width:xs.length?Math.max(...xs)-Math.min(...xs)+1:0,height:ys.length?Math.max(...ys)-Math.min(...ys)+1:0};
  });
  await expect.poll(async()=> (await pixels()).height).toBeGreaterThanOrEqual(8);
  await expect.poll(async()=> (await pixels()).width).toBeGreaterThanOrEqual(70);
  const bounds=await pixels();expect(bounds.height).toBeLessThanOrEqual(24);
  if(first){expect(Math.abs(bounds.width-first.width)).toBeLessThanOrEqual(2);expect(Math.abs(bounds.height-first.height)).toBeLessThanOrEqual(2);}else first=bounds;
  expect(await page.evaluate(()=>(window as any).rulerFixture.text())).toBe('10 ft · 2 cells');
  await page.screenshot({path:info.outputPath(`ruler-${scale}.png`)});
 }
 await page.evaluate(()=>(window as any).rulerFixture.active(false));await expect.poll(()=>page.evaluate(()=>(window as any).rulerFixture.rulerCount())).toBe(0);
 await page.evaluate(()=>(window as any).rulerFixture.active(true));await expect.poll(()=>page.evaluate(()=>(window as any).rulerFixture.rulerCount())).toBe(1);
 expect(errors).toEqual([]);
});

test('ruler label stays inside the canvas while panning near every edge',async({page,context,baseURL},info)=>{
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
 await page.goto('/e2e/fixtures/map-ruler.html');await page.waitForFunction(()=>!!(window as any).rulerFixture);
 const canvas=page.locator('canvas');await canvas.click({position:{x:35,y:35}});await canvas.click({position:{x:175,y:35}});
 await page.getByRole('heading',{name:'Map ruler'}).hover();
 for(const [x,y] of [[5,5],[315,5],[315,315],[5,315],[160,160]]){
  await page.evaluate(([x,y])=>(window as any).rulerFixture.tipAt(x,y),[x,y]);
  await expect.poll(()=>page.evaluate(()=>{const b=(window as any).rulerFixture.labelBounds();return b&&b.x>=4&&b.y>=4&&b.x+b.width<=316&&b.y+b.height<=316;})).toBe(true);
  expect(await page.evaluate(()=>(window as any).rulerFixture.text())).toBe('10 ft · 2 cells');
  await page.screenshot({path:info.outputPath(`ruler-edge-${x}-${y}.png`)});
 }
 await page.evaluate(()=>(window as any).rulerFixture.resize(160,120));
 await expect.poll(()=>page.evaluate(()=>{const b=(window as any).rulerFixture.labelBounds();return b&&b.x>=4&&b.y>=4&&b.x+b.width<=156&&b.y+b.height<=116;})).toBe(true);
 expect(await page.evaluate(()=>(window as any).rulerFixture.text())).toBe('10 ft · 2 cells');
});
