import type { BackgroundData } from '../types';

/**
 * 2024 PHB: Each background grants +2 to one ability score and +1 to another.
 * These are fixed per background (not freely assigned).
 */
export const BACKGROUNDS: BackgroundData[] = [
  {
    name: 'Acolyte',
    asi_primary: 'wisdom',
    asi_secondary: 'intelligence',
    skill_proficiencies: ['Insight', 'Religion'],
    tool_proficiency: null,
    languages: 2,
    feature_name: 'Shelter of the Faithful',
    feature_description:
      'As an acolyte, you command the respect of those who share your faith. You and your companions can receive free healing and care at temples, shrines, and sanctuaries of your faith. Those who share your religion will support you (though only you, not necessarily your companions).',
    starting_equipment: ['Holy Symbol', 'Prayer Book', '5 Sticks of Incense', 'Vestments', 'Common Clothes', '15 gp'],
  },
  {
    name: 'Charlatan',
    asi_primary: 'charisma',
    asi_secondary: 'dexterity',
    skill_proficiencies: ['Deception', 'Sleight of Hand'],
    tool_proficiency: 'Forgery Kit',
    languages: 0,
    feature_name: 'False Identity',
    feature_description:
      'You have created a second identity that includes documentation, established acquaintances, and disguises that allow you to assume that persona. Additionally, you can forge documents including official papers and personal letters, as long as you have seen an example of the kind of document or the handwriting you are trying to copy.',
    starting_equipment: ['Fine Clothes', 'Disguise Kit', 'Tools of the Con', '15 gp'],
  },
  {
    name: 'Criminal',
    asi_primary: 'dexterity',
    asi_secondary: 'intelligence',
    skill_proficiencies: ['Deception', 'Stealth'],
    tool_proficiency: "Thieves' Tools",
    languages: 0,
    feature_name: 'Criminal Contact',
    feature_description:
      'You have a reliable and trustworthy contact who acts as your liaison to a network of other criminals. You know how to get messages to and from your contact, even over great distances; specifically, you know the local messengers, corrupt caravan masters, and seedy sailors who can deliver messages for you.',
    starting_equipment: ["Crowbar", "Dark Common Clothes with Hood", "15 gp"],
  },
  {
    name: 'Entertainer',
    asi_primary: 'charisma',
    asi_secondary: 'dexterity',
    skill_proficiencies: ['Acrobatics', 'Performance'],
    tool_proficiency: 'One type of musical instrument',
    languages: 0,
    feature_name: 'By Popular Demand',
    feature_description:
      'You can always find a place to perform. At such a place, you receive free lodging and food of a modest or comfortable standard, as long as you perform each night. In addition, your performance makes you something of a local figure. When strangers recognize you in a town where you have performed, they typically take a liking to you.',
    starting_equipment: ['Musical Instrument', "Entertainer's Costume", "Favor of an Admirer", '15 gp'],
  },
  {
    name: 'Folk Hero',
    asi_primary: 'constitution',
    asi_secondary: 'strength',
    skill_proficiencies: ['Animal Handling', 'Survival'],
    tool_proficiency: "One type of Artisan's Tools",
    languages: 0,
    feature_name: 'Rustic Hospitality',
    feature_description:
      'Since you come from the ranks of the common folk, you fit in among them with ease. You can find a place to hide, rest, or recuperate among commoners, unless you have shown yourself to be a danger to them. They will shield you from the law or anyone else searching for you, though they will not risk their lives for you.',
    starting_equipment: ["Artisan's Tools", 'Shovel', 'Iron Pot', 'Common Clothes', '10 gp'],
  },
  {
    name: 'Guild Artisan',
    asi_primary: 'intelligence',
    asi_secondary: 'charisma',
    skill_proficiencies: ['Insight', 'Persuasion'],
    tool_proficiency: "One type of Artisan's Tools",
    languages: 1,
    feature_name: 'Guild Membership',
    feature_description:
      'As an established and respected member of a guild, you can rely on certain benefits that membership provides. Your fellow guild members will provide you with lodging and food if necessary, and pay for your funeral if needed. In some cities and towns, a guildhall offers a central place to meet other members of your profession.',
    starting_equipment: ["Artisan's Tools", 'Letter of Introduction from Guild', 'Traveler\'s Clothes', '15 gp'],
  },
  {
    name: 'Hermit',
    asi_primary: 'wisdom',
    asi_secondary: 'constitution',
    skill_proficiencies: ['Medicine', 'Religion'],
    tool_proficiency: 'Herbalism Kit',
    languages: 1,
    feature_name: 'Discovery',
    feature_description:
      'The quiet seclusion of your extended hermitage gave you access to a unique and powerful discovery. Work with your DM to determine the details of your discovery and its impact on the campaign.',
    starting_equipment: ['Scroll Case with Notes', 'Winter Blanket', 'Common Clothes', 'Herbalism Kit', '5 gp'],
  },
  {
    name: 'Noble',
    asi_primary: 'charisma',
    asi_secondary: 'intelligence',
    skill_proficiencies: ['History', 'Persuasion'],
    tool_proficiency: 'One type of Gaming Set',
    languages: 1,
    feature_name: 'Position of Privilege',
    feature_description:
      'Thanks to your noble birth, people are inclined to think the best of you. You are welcome in high society, and people assume you have the right to be wherever you are. The common folk make every effort to accommodate you and avoid your displeasure, and other people of high birth treat you as a member of the same social sphere.',
    starting_equipment: ['Fine Clothes', 'Signet Ring', 'Scroll of Pedigree', '25 gp'],
  },
  {
    name: 'Sage',
    asi_primary: 'intelligence',
    asi_secondary: 'wisdom',
    skill_proficiencies: ['Arcana', 'History'],
    tool_proficiency: null,
    languages: 2,
    feature_name: 'Researcher',
    feature_description:
      'When you attempt to learn or recall a piece of lore, if you do not know that information, you often know where and from whom you can obtain it. Usually, this information comes from a library, scriptorium, university, or a sage or other learned person or creature. Your DM might rule that the knowledge you seek is secreted away in an almost inaccessible place.',
    starting_equipment: ['Bottle of Black Ink', 'Quill', 'Small Knife', 'Letter from Dead Colleague', 'Common Clothes', '10 gp'],
  },
  {
    name: 'Soldier',
    asi_primary: 'strength',
    asi_secondary: 'constitution',
    skill_proficiencies: ['Athletics', 'Intimidation'],
    tool_proficiency: 'One type of Gaming Set',
    languages: 0,
    feature_name: 'Military Rank',
    feature_description:
      'You have a military rank from your career as a soldier. Soldiers loyal to your former military organization still recognize your authority and influence, and they defer to you if they are of a lower rank. You can invoke your rank to exert influence over other soldiers and requisition simple equipment or horses for temporary use.',
    starting_equipment: ['Insignia of Rank', 'Trophy from Fallen Enemy', 'Deck of Cards', 'Common Clothes', '10 gp'],
  },
];

export const BACKGROUND_MAP: Record<string, BackgroundData> = Object.fromEntries(
  BACKGROUNDS.map(b => [b.name, b])
);
