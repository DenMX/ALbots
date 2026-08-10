import type { Document, Model } from "mongoose"

/** Singleton party-wide crypt run marker (survives client restart). */
export interface IActiveCrypt {
    /** Fixed key so we always upsert the same document */
    key: "crypt"
    active: boolean
    instanceId?: string
    /** Epoch ms — hold party out until this time after open. 0/absent = not waiting. */
    levelUpUntil?: number
    /** Epoch ms when the instance was opened */
    openedAt?: number
    updatedAt?: Date
}

export interface IActiveCryptDocument extends IActiveCrypt, Document {}

export type IActiveCryptModel = Model<IActiveCryptDocument>
