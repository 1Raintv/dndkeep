/** v2.866: source (spell/weapon) and delivery (melee/ranged) are independent.
 * Legacy rows retain the old fallback until their actual delivery can be reviewed. */
export type AttackMode='melee'|'ranged';
export function attackIsMelee(attack:{attack_mode?:AttackMode|null;attack_source?:string|null}):boolean {
 return attack.attack_mode?attack.attack_mode==='melee':(attack.attack_source??'').toLowerCase()!=='ranged';
}
/** Only explicit row range or action-header wording may classify a new attack.
 * Do not infer melee from target distance, Touch, a spell name or missing text. */
export function explicitAttackMode(text:string|null|undefined):AttackMode|null {
 if(!text)return null;
 if(/^\s*\d+\s*\/\s*\d+(?:\s*(?:ft\.?|feet))?\s*$/i.test(text))return 'ranged';
 const melee=/\bmelee\b/i.test(text),ranged=/\branged?\b/i.test(text);
 if(melee===ranged)return null;return melee?'melee':'ranged';
}
