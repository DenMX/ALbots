export interface Bot {
  id: string
  name: string
  realm: string
  rip: boolean
  level: number
  health: number
  maxHealth: number
  mana: number
  maxMana: number
  xp: number
  maxXp: number
  isize: number
  esize: number
  gold: number
  party: string
  status: string
  target: string
  cc: number
  xpPh: number
  attack: number
  frequency: number
  armor: number
  resistance: number
  dps: number
  physicalReduction: number
  magicalReduction: number
  statusInfo: Record<string, any>
  inventoryUsage: number
}