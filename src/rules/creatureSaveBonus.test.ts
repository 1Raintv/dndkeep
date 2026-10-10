import {expect,it} from 'vitest';
import {creatureSaveBonus} from './creatureSaveBonus';
import {crToProficiencyBonus} from './proficiency';
it('uses catalog totals rather than adding proficiency',()=>{expect(creatureSaveBonus('INT',{int:18,cr:9,saving_throws:{int:9},save_proficiencies:['int']})).toMatchObject({bonus:9});});
it('uses verified homebrew scores and full proficiency names',()=>{expect(creatureSaveBonus('INT',{ability_scores:{int:18},save_proficiencies:['Intelligence'],cr:9})).toMatchObject({bonus:8});});
it('NULL totals leave verified legacy homebrew unchanged',()=>{expect(creatureSaveBonus('INT',{saving_throws:null,ability_scores:{int:18},save_proficiencies:[],cr:null})).toMatchObject({bonus:4});});
it('keeps an explicit empty map and negative ability modifier',()=>{expect(creatureSaveBonus('WIS',{saving_throws:{},wis:9})).toMatchObject({bonus:-1});});
it.each([null,{}, {int:18}, {saving_throws:null,int:18}, {saving_throws:{int:'9'},int:18}, {ability_scores:{int:18},save_proficiencies:['int'],cr:null}])('does not invent saves from %j',row=>{expect(creatureSaveBonus('INT',row)).toBeNull();});
it.each([[0,2],[4,2],[5,3],[8,3],[9,4],[12,4],[13,5],[16,5],[17,6],[20,6],[21,7],[24,7],[25,8],[28,8],[29,9],[30,9]])('retains canonical CR %s proficiency %s', (cr,pb)=>{expect(crToProficiencyBonus(cr)).toBe(pb);});
