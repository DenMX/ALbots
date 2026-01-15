import { PingCompensatedCharacter } from "alclient"


export interface IState {
    getStateType(): string
    getBot(): PingCompensatedCharacter
}