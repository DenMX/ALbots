import type { Document, Model } from "mongoose"
import type { MonsterName, IPosition } from "alclient"

export interface IState {
    wantedMob: MonsterName | MonsterName[],
    state_type: "farm" | "event" | "boss" | "quest"
    location?: IPosition
}

export interface IStateDocument extends IState, Document {}

export type IStateModel = Model<IStateDocument>