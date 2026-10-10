import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
test('unarmed controls request the targets save without an attacker roll',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)&&url.port==='5173')return route.continue();return route.fulfill({status:200,contentType:'application/json',body:'[]'});});
 await page.goto('/login');await page.evaluate(async()=>{
  const react='/node_modules/.vite/deps/react.js',dom='/node_modules/.vite/deps/react-dom_client.js',path='/src/components/CharacterSheet/WeaponsTracker.tsx';
  const [React,client,view]=await Promise.all([import(react),import(dom),import(path)]);
  const host=document.createElement('div');host.id='unarmed-fixture';document.getElementById('root')!.style.display='none';document.body.appendChild(host);
  client.default.createRoot(host).render(React.default.createElement(view.default,{weapons:[{id:'unarmed',name:'Unarmed Strike',attackBonus:5,damageDice:'flat',damageBonus:4,damageType:'bludgeoning',range:'Melee',properties:'',notes:'',unarmedModes:true,unarmedSaveDC:13,athleticsBonus:17}],attacksPerAction:2,onUpdate:()=>{}}));
 });
 await page.getByRole('button',{name:'STRIKE'}).click();const dialog=page.getByRole('dialog',{name:'Unarmed Strike'});
 await expect(dialog).toContainText('base DC 13');await expect(dialog).not.toContainText('Athletics check');await expect(dialog).toContainText('free hand');
 await page.screenshot({path:`.tmp/unarmed-save-${info.project.name}.png`});
 if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
 await dialog.getByRole('button',{name:/^Grapple/}).click();await expect(dialog).toBeHidden();await expect(page.getByRole('status')).toContainText('Save requested only');
 expect(errors).toEqual([]);
});
