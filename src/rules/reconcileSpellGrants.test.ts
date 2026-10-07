import {expect,it} from 'vitest';
import {reconcileSpellGrants,type AutomaticSpellGrant} from './reconcileSpellGrants';
import type {SpellSources} from './spellSources';
const base={known:[] as string[],prepared:[] as string[],sources:{} as SpellSources,preparationSources:{} as SpellSources,grants:[] as AutomaticSpellGrant[]};
it('tracks new class and species grants separately from chosen spells',()=>{
 expect(reconcileSpellGrants({...base,grants:[{id:'hand',source:'grant:class:Psion',prepared:false},{id:'darkness',source:'grant:species',prepared:true}]})).toEqual({ok:true,known:['hand','darkness'],prepared:['darkness'],sources:{hand:['grant:class:Psion'],darkness:['grant:species']},preparationSources:{darkness:['grant:species']}});
});
it('expiry removes only the grant and restores independently learned readiness',()=>{
 const c={...base,known:['armor'],prepared:['armor'],sources:{armor:['class:Wizard','grant:class:Psion']} as SpellSources,preparationSources:{armor:['grant:class:Psion']} as SpellSources};
 expect(reconcileSpellGrants(c)).toMatchObject({ok:true,known:['armor'],prepared:[],sources:{armor:['class:Wizard']},preparationSources:{armor:[]}});
 expect(c.prepared).toEqual(['armor']);
});
it('retains a separately prepared copy through grant expiry',()=>{
 expect(reconcileSpellGrants({...base,known:['armor'],prepared:['armor'],sources:{armor:['class:Psion','grant:species']},preparationSources:{armor:['class:Psion','grant:species']}})).toMatchObject({ok:true,known:['armor'],prepared:['armor'],sources:{armor:['class:Psion']},preparationSources:{armor:['class:Psion']}});
});
it('removes a tracked grant-only spell when no longer active',()=>{
 expect(reconcileSpellGrants({...base,known:['armor'],prepared:['armor'],sources:{armor:['grant:class:Psion']},preparationSources:{armor:['grant:class:Psion']}})).toEqual({ok:true,known:[],prepared:[],sources:{},preparationSources:{}});
});
it('never reclassifies or prunes unknown legacy entries',()=>{
 const before={...base,known:['armor'],prepared:['armor'],grants:[{id:'armor',source:'grant:species',prepared:true}] as AutomaticSpellGrant[]};
 const active=reconcileSpellGrants(before);expect(active).toMatchObject({ok:true,known:['armor'],prepared:['armor'],sources:{},preparationSources:{}});
 if(!active.ok)return;
 expect(reconcileSpellGrants({...active,grants:[]})).toMatchObject({ok:true,known:['armor'],prepared:['armor'],sources:{}});
});
it('adds an active grant without removing another class’s reviewed copy',()=>{
 expect(reconcileSpellGrants({...base,known:['armor'],sources:{armor:['class:Wizard']},preparationSources:{armor:[]},grants:[{id:'armor',source:'grant:class:Psion',prepared:true}]})).toMatchObject({ok:true,sources:{armor:['class:Wizard','grant:class:Psion']},prepared:['armor'],preparationSources:{armor:['grant:class:Psion']}});
});
it('does not invent other readiness when a shared legacy preparation is unknown',()=>{
 expect(reconcileSpellGrants({...base,known:['armor'],prepared:['armor'],sources:{armor:['class:Wizard']},grants:[{id:'armor',source:'grant:class:Psion',prepared:true}]})).toMatchObject({ok:true,preparationSources:{},prepared:['armor']});
});
it('rejects malformed metadata',()=>{
 expect(reconcileSpellGrants({...base,sources:{armor:null} as unknown as SpellSources}).ok).toBe(false);
});

it('expires only granted readiness on a legacy spell whose ownership is unknown',()=>{
 const active=reconcileSpellGrants({...base,known:['armor'],grants:[{id:'armor',source:'grant:species',prepared:true}]});
 expect(active).toMatchObject({ok:true,known:['armor'],prepared:['armor'],sources:{},preparationSources:{armor:['grant:species']}});
 if(!active.ok)return;
 expect(reconcileSpellGrants({...active,grants:[]})).toMatchObject({ok:true,known:['armor'],prepared:[],sources:{},preparationSources:{armor:[]}});
});
