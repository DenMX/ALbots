import pkg from "mongoose"
const { model } = pkg

import StateSchema from "./state.schema"
import { IStateDocument } from "./state.types"

export const StateModel = model<IStateDocument>("state", StateSchema)
StateModel.createIndexes().catch((e) => {
    if(pkg.connection.readyState) console.error(e)
})