/** UA Update pp.3–5: a conditional attempt uses the discipline even when its die is kept. */
export const DISCIPLINE_NAMES={
 'biofeedback':'Biofeedback','bolstering-precognition':'Bolstering Precognition',
 'destructive-thoughts':'Destructive Thoughts','devilish-tongue':'Devilish Tongue',
 'expanded-awareness':'Expanded Awareness','id-insinuation':'Id Insinuation',
 'inerrant-aim':'Inerrant Aim','observant-mind':'Observant Mind',
 'psionic-backlash':'Psionic Backlash','psionic-guards':'Psionic Guards','sharpened-mind':'Sharpened Mind',
} as const;
export type DisciplineId=keyof typeof DISCIPLINE_NAMES;
export const disciplineIsConditional=(id:DisciplineId)=>['devilish-tongue','expanded-awareness','inerrant-aim','observant-mind'].includes(id);
