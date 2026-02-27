import { PingCompensatedCharacter, MonsterName } from "alclient"


export interface IState {
    getStateType(): string
    getBot(): PingCompensatedCharacter
    getWantedMob(): MonsterName|MonsterName[]
    deactivateStrat(): void
}