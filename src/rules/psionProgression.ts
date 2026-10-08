export interface PsionicClassState {
 class_name:string;level:number;subclass?:string|null;
 secondary_class?:string|null;secondary_level?:number|null;secondary_subclass?:string|null;
}
/** UA Update p.2: all features and Energy Dice scale with Psion levels,
 * regardless of class order. Total levels matter only for shared limits.
 * v2.792 — malformed/duplicate class progressions cannot grant resources. */
export function psionProgression(c:PsionicClassState):{level:number;subclass:string|null;totalLevel:number}|null {
 if(!c.class_name||!Number.isInteger(c.level)||c.level<1||c.level>20)return null;
 const secondary=c.secondary_class?(c.secondary_level??0):0;
 if(!Number.isInteger(secondary)||secondary<0||c.level+secondary>20)return null;
 if(c.secondary_class===c.class_name&&secondary>0)return null;
 if(c.class_name==='Psion')return {level:c.level,subclass:c.subclass??null,totalLevel:c.level+secondary};
 if(c.secondary_class==='Psion'&&secondary>0)return {level:secondary,subclass:c.secondary_subclass??null,totalLevel:c.level+secondary};
 return null;
}
