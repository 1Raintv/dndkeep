import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('index.html','utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(code=>code.includes("serviceWorker.register('/sw.js')"))!;

test('controller changes distinguish first claim from an update',()=>{
 expect(script).toBeTruthy();
 for(const existing of [false,true]){
  let changed!:()=>void,reloads=0;
  const worker={controller:existing?{}:null as object|null,addEventListener:(_name:string,fn:()=>void)=>{changed=fn;}};
  runInNewContext(script,{navigator:{serviceWorker:worker},window:{addEventListener:()=>{},location:{reload:()=>{reloads++;}}}});
  changed();expect(reloads).toBe(existing?1:0);
  worker.controller={};changed();expect(reloads).toBe(existing?1:0);
  worker.controller={};changed();expect(reloads).toBe(1);
  changed();expect(reloads).toBe(1);
 }
});

test('a fresh browser installs its worker without interrupting the page',async({page,context,baseURL})=>{
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin?route.continue():route.abort());
 let navigations=0;page.on('request',request=>{if(request.isNavigationRequest()&&request.resourceType()==='document')navigations++;});
 await page.goto('/');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 // The marker must survive the first controller claim; an actual reload clears it.
 const firstDocument=await page.evaluate(()=>performance.timeOrigin);
 await page.waitForTimeout(500);
 expect(navigations).toBe(1);
 expect(await page.evaluate(()=>performance.timeOrigin)).toBe(firstDocument);
});
