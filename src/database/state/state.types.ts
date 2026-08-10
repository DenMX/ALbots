import type { Document, Model } from "mongoose"
import type { MonsterName, IPosition, ServerIdentifier, ServerRegion } from "alclient"

export interface IState {
    wantedMob: MonsterName | MonsterName[],
    state_type: "farm" | "event" | "boss" | "quest" | "crypt"
    location?: IPosition
    server?: {region: ServerRegion, name: ServerIdentifier}
    /** Crypt instance id (`character.in` in alclient) */
    instanceId?: string
}

export interface IStateDocument extends IState, Document {}

export type IStateModel = Model<IStateDocument>