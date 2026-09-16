export interface BuildChoices {
  subclass: string;
  spells: string[];       // spell IDs
  cantrips: string[];     // cantrip IDs
  metamagic: string[];    // flat list of ALL known metamagic (derived from metamagicByLevel)
  metamagicByLevel: Record<number, string[]>;  // level -> metamagic chosen at that level
  invocations: string[];  // flat list of ALL known invocations
  invocationsByLevel: Record<number, string[]>;  // level -> invocations chosen at that level
  fightingStyle: string;
  expertise: string[];    // skill names
  feats: Record<number, string>;  // level -> feat name
  asiChoices: Record<number, { ability: string; amount: number; ability2?: string; amount2?: number }>;
  divineOrder: string;
  primalOrder: string;
}

export const emptyBuildChoices = (): BuildChoices => ({
  subclass: '', spells: [], cantrips: [], metamagic: [], metamagicByLevel: {}, invocations: [], invocationsByLevel: {},
  fightingStyle: '', expertise: [], feats: {}, asiChoices: {},
  divineOrder: '', primalOrder: '',
});

