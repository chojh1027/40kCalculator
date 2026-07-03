import type { AttackCount } from "@40k-calculator/calculator";

export type WeaponType = "ranged" | "melee";

export interface Alliance {
  id: string;
  name: string;
}

export interface Faction {
  id: string;
  allianceId: string;
  name: string;
}

export interface Weapon {
  id: string;
  name: string;
  type: WeaponType;
  attacks: AttackCount;
  strength: number;
  armorPenetration: number;
  damage: number;
  skillOverride?: number;
}

export interface Unit {
  id: string;
  factionId: string;
  name: string;
  ballisticSkill: number;
  weaponSkill: number;
  toughness: number;
  save: number;
  invulnerableSave?: number;
  wounds: number;
  defaultModelCount: number;
  minModelCount: number;
  maxModelCount: number;
  weaponIds: string[];
}

export const ALLIANCES: Alliance[] = [
  { id: "imperium", name: "Imperium" },
  { id: "chaos", name: "Chaos" },
  { id: "xenos", name: "Xenos" },
];

export const FACTIONS: Faction[] = [
  { id: "space-marines", allianceId: "imperium", name: "Space Marines" },
  { id: "astra-militarum", allianceId: "imperium", name: "Astra Militarum" },
  { id: "chaos-space-marines", allianceId: "chaos", name: "Chaos Space Marines" },
  { id: "orks", allianceId: "xenos", name: "Orks" },
];

export const WEAPONS: Weapon[] = [
  {
    id: "bolt-rifle",
    name: "Bolt Rifle",
    type: "ranged",
    attacks: 2,
    strength: 4,
    armorPenetration: -1,
    damage: 1,
  },
  {
    id: "temporary-d6-blaster",
    name: "D6 Test Blaster (Temporary)",
    type: "ranged",
    attacks: { kind: "dice", count: 1, sides: 6 },
    strength: 4,
    armorPenetration: 0,
    damage: 1,
  },
  {
    id: "plasma-incinerator",
    name: "Plasma Incinerator",
    type: "ranged",
    attacks: 2,
    strength: 7,
    armorPenetration: -2,
    damage: 2,
  },
  {
    id: "lascannon",
    name: "Lascannon (MVP fixed damage)",
    type: "ranged",
    attacks: 1,
    strength: 12,
    armorPenetration: -3,
    damage: 4,
  },
  {
    id: "storm-bolter",
    name: "Storm Bolter",
    type: "ranged",
    attacks: 2,
    strength: 4,
    armorPenetration: 0,
    damage: 1,
  },
  {
    id: "chainsword",
    name: "Chainsword",
    type: "melee",
    attacks: 4,
    strength: 4,
    armorPenetration: -1,
    damage: 1,
  },
  {
    id: "power-fist",
    name: "Power Fist",
    type: "melee",
    attacks: 3,
    strength: 8,
    armorPenetration: -2,
    damage: 2,
    skillOverride: 4,
  },
  {
    id: "choppa",
    name: "Choppa",
    type: "melee",
    attacks: 3,
    strength: 4,
    armorPenetration: -1,
    damage: 1,
  },
];

export const UNITS: Unit[] = [
  {
    id: "intercessor-squad",
    factionId: "space-marines",
    name: "Intercessor Squad",
    ballisticSkill: 3,
    weaponSkill: 3,
    toughness: 4,
    save: 3,
    wounds: 2,
    defaultModelCount: 5,
    minModelCount: 5,
    maxModelCount: 10,
    weaponIds: ["bolt-rifle", "temporary-d6-blaster", "chainsword"],
  },
  {
    id: "hellblaster-squad",
    factionId: "space-marines",
    name: "Hellblaster Squad",
    ballisticSkill: 3,
    weaponSkill: 3,
    toughness: 4,
    save: 3,
    wounds: 2,
    defaultModelCount: 5,
    minModelCount: 5,
    maxModelCount: 10,
    weaponIds: ["plasma-incinerator"],
  },
  {
    id: "devastator-squad",
    factionId: "space-marines",
    name: "Devastator Squad",
    ballisticSkill: 3,
    weaponSkill: 3,
    toughness: 4,
    save: 3,
    wounds: 2,
    defaultModelCount: 5,
    minModelCount: 5,
    maxModelCount: 10,
    weaponIds: ["lascannon", "chainsword"],
  },
  {
    id: "terminator-squad",
    factionId: "space-marines",
    name: "Terminator Squad",
    ballisticSkill: 3,
    weaponSkill: 3,
    toughness: 5,
    save: 2,
    invulnerableSave: 4,
    wounds: 3,
    defaultModelCount: 5,
    minModelCount: 5,
    maxModelCount: 10,
    weaponIds: ["storm-bolter", "power-fist"],
  },
  {
    id: "infantry-squad",
    factionId: "astra-militarum",
    name: "Infantry Squad",
    ballisticSkill: 4,
    weaponSkill: 4,
    toughness: 3,
    save: 5,
    wounds: 1,
    defaultModelCount: 10,
    minModelCount: 10,
    maxModelCount: 20,
    weaponIds: ["lascannon"],
  },
  {
    id: "legionaries",
    factionId: "chaos-space-marines",
    name: "Legionaries",
    ballisticSkill: 3,
    weaponSkill: 3,
    toughness: 4,
    save: 3,
    wounds: 2,
    defaultModelCount: 5,
    minModelCount: 5,
    maxModelCount: 10,
    weaponIds: ["chainsword"],
  },
  {
    id: "boyz",
    factionId: "orks",
    name: "Boyz",
    ballisticSkill: 5,
    weaponSkill: 3,
    toughness: 5,
    save: 5,
    wounds: 1,
    defaultModelCount: 10,
    minModelCount: 10,
    maxModelCount: 20,
    weaponIds: ["choppa"],
  },
];

export const WEAPONS_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
