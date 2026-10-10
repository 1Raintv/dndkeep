import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
test('party panel uses available screen space and preserves explicit choices',async({page,context,baseURL},info)=>{
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.fulfill({status:200,contentType:'application/json',body:'{}'}));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('/e2e/fixtures/party-vitals.html');const panel=page.getByRole('region',{name:'Party vitals'}),show=page.getByTitle('Show party vitals'),hide=page.getByRole('button',{name:'Collapse party panel'});
 const compact=(page.viewportSize()!.width<=600||page.viewportSize()!.height<=500);
 await expect(panel).toHaveAttribute('data-collapsed',String(compact));
 await page.screenshot({path:`.tmp/party-default-${info.project.name}.png`});
 if(compact)await show.click();await expect(page.getByRole('button',{name:'Focus Nyx on map'})).toBeVisible();
 await hide.click();await page.reload();await expect(show).toBeVisible();await show.click();
 await page.reload();await expect(hide).toBeVisible();await expect(panel).toContainText('8 / 20');
 if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('.party-vitals, .party-vitals *')");const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
 await page.screenshot({path:`.tmp/party-expanded-${info.project.name}.png`});
 await page.setViewportSize({width:851,height:393});await page.evaluate(()=>localStorage.removeItem('dndkeep:battlemap_v2:party_panel_collapsed'));await page.reload();await expect(show).toBeVisible();
 expect(errors).toEqual([]);
});
