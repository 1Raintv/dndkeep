import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
test.describe('party vitals layout',()=>{gateDbSuite();test('readable cards and unobstructed controls',async({page},info)=>{
 await signInAsSeedDm(page);await page.goto('/campaigns');await page.getByText('Local Test Campaign',{exact:true}).locator('visible=true').first().click();
 await expect(page.locator('canvas').first()).toBeVisible();await page.getByTitle('Fullscreen map',{exact:true}).click();
 const party=page.getByRole('region',{name:'Party vitals'});
 const collapsed=page.getByTitle('Show party vitals');if(await collapsed.isVisible())await collapsed.click();
 const first=party.getByRole('button',{name:/Focus .+ on map/}).first();await expect(first).toBeVisible();
 const card=await first.boundingBox();const group=await party.getByRole('group',{name:'Party characters'}).boundingBox();
 expect(card!.x).toBeGreaterThanOrEqual(group!.x-1);expect(card!.x+card!.width).toBeLessThanOrEqual(group!.x+group!.width+1);
 await expect(first.locator('.party-vitals-track')).toHaveJSProperty('clientWidth',await first.locator('.party-vitals-health').evaluate(el=>el.clientWidth));
 expect(await first.locator('.party-vitals-track').evaluate(el=>el.clientWidth)).toBeGreaterThan(100);
 await first.focus();await expect(first).toBeFocused();
 await page.screenshot({path:info.outputPath('party-vitals.png')});
 const navigation=page.getByRole('toolbar',{name:'Map navigation'});
 const separation=async()=>{const p=await party.boundingBox();const n=await navigation.boundingBox();return p!.y-(n!.y+n!.height);};
 await expect.poll(separation).toBeGreaterThanOrEqual(10);
 await party.getByRole('button',{name:'Collapse party panel'}).click();await expect(collapsed).toBeVisible();
 await collapsed.click();await expect(first).toBeVisible();
 // Simulate the initiative strip mounting and changing height; this directly
 // exercises the shared obstacle observer without mutating the seeded battle.
 await page.evaluate(()=>{const strip=document.createElement('div');strip.className='initiative-strip';strip.dataset.layoutProbe='true';strip.style.cssText='position:fixed;bottom:0;left:0;right:0;height:90px;z-index:9999';document.body.appendChild(strip);});
 await expect.poll(separation).toBeGreaterThanOrEqual(10);
 await expect.poll(async()=>{const p=await party.boundingBox();return page.viewportSize()!.height-(p!.y+p!.height);}).toBeGreaterThanOrEqual(100);
 await page.evaluate(()=>document.querySelector('[data-layout-probe]')?.remove());

});});
