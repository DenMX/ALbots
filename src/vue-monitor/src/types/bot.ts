export interface StatusEffect {
  name: string;
  description: string;
  duration?: number;
  stack?: number;
  source?: string;
  intensity?: number;
}

export interface Bot {
  id: number;
  name: string;
  class: string;
  health: number;
  maxHealth: number;
  energy: number;
  maxEnergy: number;
  level: number;
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
  specials: StatusEffect[];
  position: number;
  active: boolean;
  // Дополнительные поля из BWIDataSource
  realm: string;
  rip: boolean;
  xp: number;
  maxXp: number;
  gold: number;
  target: string;
  attack: number;
  frequency: number;
  armor: number;
  resistance: number;
  dps: number;
  physicalReduction: number;
  magicalReduction: number;
  isize: number;
  esize: number;
  cc: number;
  xpPh: number;
  party: string;
  status: string;
}

// Функция для преобразования данных из BWIReporter
export function transformBWIDataToBot(bwiData: any, index: number): Bot {
  const statusInfo = bwiData.statusInfo || {};
  
  // Извлекаем баффы из статусов
  const buffs: StatusEffect[] = extractStatusEffects(statusInfo, [
    { key: 'warcry', name: 'War Cry' },
    { key: 'mluck', name: 'Magic Luck' },
    { key: 'rspeed', name: 'Rapid Speed' },
    { key: 'newcomersblessing', name: "Newcomer's Blessing" },
    { key: 'young', name: 'Young' },
    { key: 'easterluck', name: 'Easter Luck' },
    { key: 'halloween', name: 'Halloween' },
    { key: 'citizen0aura', name: 'Citizen Aura 0' },
    { key: 'citizen4aura', name: 'Citizen Aura 4' },
    { key: 'darkblessing', name: 'Dark Blessing' },
    { key: 'self_healing', name: 'Self Healing' }
  ]);
  
  // Извлекаем дебаффы из статусов
  const debuffs: StatusEffect[] = extractStatusEffects(statusInfo, [
    { key: 'poisoned', name: 'Poisoned' },
    { key: 'cursed', name: 'Cursed' },
    { key: 'slowed', name: 'Slowed' },
    { key: 'stunned', name: 'Stunned' },
    { key: 'sick', name: 'Sick' },
    { key: 'shocked', name: 'Shocked' },
    { key: 'frozen', name: 'Frozen' },
    { key: 'marked', name: 'Marked' },
    { key: 'weakness', name: 'Weakness' },
    { key: 'stone', name: 'Stone' }
  ]);
  
  // Извлекаем спецэффекты
  const specials: StatusEffect[] = [];
  
  if (statusInfo.burned) {
    specials.push({
      name: 'Burned',
      description: `Takes ${statusInfo.burned.intensity || 0} DPS`,
      source: statusInfo.burned.f || 'unknown'
    });
  }
  
  if (statusInfo.coop) {
    specials.push({
      name: 'Cooperation',
      description: `${statusInfo.coop.p}% bonus`,
      duration: Math.floor(statusInfo.coop.ms / 1000)
    });
  }
  
  if (statusInfo.monsterhunt) {
    specials.push({
      name: 'Monster Hunt',
      description: `${statusInfo.monsterhunt.c} ${statusInfo.monsterhunt.id} remaining`
    });
  }
  
  if (statusInfo.blink) {
    specials.push({
      name: 'Blink',
      description: `Map: ${statusInfo.blink.map}`
    });
  }
  
  if (statusInfo.typing) {
    specials.push({
      name: 'Typing',
      description: 'Currently typing',
      duration: Math.floor(statusInfo.typing.ms / 1000)
    });
  }
  
  if (statusInfo.healed) {
    specials.push({
      name: 'Healed',
      description: 'Recent healing',
      duration: Math.floor(statusInfo.healed.ms / 1000)
    });
  }
  
  // Определяем класс бота на основе статуса
  const botClass = determineBotClass(bwiData.status, bwiData.name);
  
  return {
    id: index,
    name: bwiData.name,
    class: botClass,
    health: bwiData.health,
    maxHealth: bwiData.maxHealth,
    energy: bwiData.mana,
    maxEnergy: bwiData.maxMana,
    level: bwiData.level,
    buffs,
    debuffs,
    specials,
    position: index + 1,
    active: !bwiData.rip,
    // Дополнительные поля
    realm: bwiData.realm,
    rip: bwiData.rip,
    xp: bwiData.xp,
    maxXp: bwiData.maxXp,
    gold: bwiData.gold,
    target: bwiData.target || 'None',
    attack: bwiData.attack,
    frequency: bwiData.frequency,
    armor: bwiData.armor,
    resistance: bwiData.resistance,
    dps: bwiData.dps || 0,
    physicalReduction: bwiData.physicalReduction || 0,
    magicalReduction: bwiData.magicalReduction || 0,
    isize: bwiData.isize,
    esize: bwiData.esize,
    cc: bwiData.cc || 0,
    xpPh: bwiData.xpPh || 0,
    party: bwiData.party || 'Solo',
    status: bwiData.status || 'Unknown'
  };
}

function extractStatusEffects(statusInfo: any, effects: Array<{key: string, name: string}>): StatusEffect[] {
  const result: StatusEffect[] = [];
  
  effects.forEach(effect => {
    if (statusInfo[effect.key]?.ms) {
      result.push({
        name: effect.name,
        description: effect.name,
        duration: Math.floor(statusInfo[effect.key].ms / 1000)
      });
    }
  });
  
  return result;
}

function determineBotClass(status: string, name: string): string {
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('farm') || statusLower.includes('combat')) return 'Warrior';
  if (statusLower.includes('move') || statusLower.includes('transport')) return 'Rogue';
  if (statusLower.includes('heal') || statusLower.includes('support')) return 'Priest';
  if (statusLower.includes('mage') || statusLower.includes('magic')) return 'Mage';
  if (statusLower.includes('merchant') || statusLower.includes('trade')) return 'Merchant';
  
  // Попробуем определить по имени
  if (name.toLowerCase().includes('warrior') || name.toLowerCase().includes('tank')) return 'Warrior';
  if (name.toLowerCase().includes('rogue') || name.toLowerCase().includes('assassin')) return 'Rogue';
  if (name.toLowerCase().includes('priest') || name.toLowerCase().includes('healer')) return 'Priest';
  if (name.toLowerCase().includes('mage') || name.toLowerCase().includes('wizard')) return 'Mage';
  if (name.toLowerCase().includes('merchant') || name.toLowerCase().includes('trader')) return 'Merchant';
  
  return 'Adventurer';
}