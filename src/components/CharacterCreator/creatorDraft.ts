import type { AbilityKey, AbilityScoreMethod, Alignment } from '../../types';
import { emptyBuildChoices, type BuildChoices } from './buildChoices';

export interface CreatorDraft {
  step: number;
  species: string;
  className: string;
  background: string;
  scores: Record<AbilityKey, number>;
  method: AbilityScoreMethod;
  subclass: string;
  name: string;
  alignment: Alignment;
  setupMode: 'recommended' | 'blank';
  selectedSkills: string[];
  buildChoices: BuildChoices;
  level: number;
  currentBuildLevel: number;
  originFeat: string;
}

export function emptyCreatorDraft(): CreatorDraft {
  return {
    step: 0, species: '', className: '', background: '',
    scores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    method: 'standard_array', subclass: '', name: '', alignment: 'True Neutral',
    setupMode: 'recommended', selectedSkills: [], buildChoices: emptyBuildChoices(),
    level: 1, currentBuildLevel: 1, originFeat: '',
  };
}

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const draftKey = (userId: string) => `dndkeep:creator-draft:v1:${userId}`;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const levels = (value: unknown, check: (entry: unknown) => boolean) =>
  record(value) && Object.entries(value).every(([key, entry]) => /^\d+$/.test(key) && integer(Number(key), 1, 20) && check(entry));

// v2.695.0 — Browser storage is fallible and untrusted. Reject incompatible
// drafts as a unit so a half-restored build cannot crash a later wizard step.
export function isCreatorDraft(value: unknown): value is CreatorDraft {
  if (!record(value) || !record(value.scores) || !record(value.buildChoices)) return false;
  const defaults = emptyCreatorDraft();
  if (!['species', 'className', 'background', 'subclass', 'name', 'originFeat'].every(key => typeof value[key] === 'string')) return false;
  if (!integer(value.step, 0, 5) || !integer(value.level, 1, 20) || !integer(value.currentBuildLevel, 1, value.level)) return false;
  if (!Object.keys(defaults.scores).every(key => integer((value.scores as Record<string, unknown>)[key], 1, 30))) return false;
  if (!['standard_array', 'point_buy', 'manual', 'dice_roll'].includes(String(value.method))) return false;
  if (!['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil', 'Unaligned'].includes(String(value.alignment))) return false;
  if (!['recommended', 'blank'].includes(String(value.setupMode)) || !strings(value.selectedSkills)) return false;
  const build = value.buildChoices;
  return ['subclass', 'fightingStyle', 'divineOrder', 'primalOrder'].every(key => typeof build[key] === 'string')
    && ['spells', 'cantrips', 'metamagic', 'invocations', 'expertise'].every(key => strings(build[key]))
    && levels(build.metamagicByLevel, strings) && levels(build.invocationsByLevel, strings)
    && levels(build.feats, entry => typeof entry === 'string')
    && levels(build.asiChoices, entry => record(entry)
      && typeof entry.ability === 'string' && integer(entry.amount, 0, 2)
      && (entry.ability2 === undefined || typeof entry.ability2 === 'string')
      && (entry.amount2 === undefined || integer(entry.amount2, 0, 2)));
}

export function readCreatorDraft(storage: DraftStorage, userId: string): CreatorDraft | null {
  try {
    const raw = storage.getItem(draftKey(userId));
    if (!raw || raw.length > 200_000) return null;
    const saved: unknown = JSON.parse(raw);
    if (!record(saved) || saved.version !== 1 || !isCreatorDraft(saved.draft)) return null;
    return saved.draft;
  } catch { return null; }
}

export function writeCreatorDraft(storage: DraftStorage, userId: string, draft: CreatorDraft): boolean {
  try {
    storage.setItem(draftKey(userId), JSON.stringify({ version: 1, draft }));
    return true;
  } catch { return false; }
}

export function clearCreatorDraft(storage: DraftStorage, userId: string): boolean {
  try { storage.removeItem(draftKey(userId)); return true; } catch { return false; }
}
