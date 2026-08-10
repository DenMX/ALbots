import pkg from "mongoose"
const { Schema } = pkg

const ActiveCryptSchema = new Schema({
    __v: {
        select: false,
        type: Number,
    },
    key: { required: true, type: String, unique: true, default: "crypt" },
    active: { required: true, type: Boolean, default: false },
    instanceId: { required: false, type: String },
    /** Epoch ms — party must not enter until this time (mob level-up wait after open). 0 = none. */
    levelUpUntil: { required: false, type: Number, default: 0 },
    /** Epoch ms when this crypt instance was opened */
    openedAt: { required: false, type: Number },
    updatedAt: { required: false, type: Date },
})

export default ActiveCryptSchema
