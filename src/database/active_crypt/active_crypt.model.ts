import pkg from "mongoose"
const { model } = pkg

import ActiveCryptSchema from "./active_crypt.schema"
import { IActiveCryptDocument } from "./active_crypt.types"

export const ActiveCryptModel = model<IActiveCryptDocument>("active_crypt", ActiveCryptSchema)
ActiveCryptModel.createIndexes().catch((e) => {
    if (pkg.connection.readyState) console.error(e)
})
