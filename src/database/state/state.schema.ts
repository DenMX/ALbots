import pkg from "mongoose"
const { Schema } = pkg

const StateSchema = new Schema({
    __v:{ 
        select: false,
        type: Number,
    },
    botId: {required: true, type: String },
    // `String || Array` always resolves to `String` in JS, which causes CastError when saving arrays.
    // We allow both `string` and `string[]` here (see `IState.wantedMob`).
    wantedMob: {required: true, type: Schema.Types.Mixed },
    state_type: {required: true, type: String },
    location: {required: false, type: Object },
    server: {required: true, type: Object }
})

export default StateSchema