import pkg from "mongoose"
const { Schema } = pkg

const StateSchema = new Schema({
    __v:{ 
        select: false,
        type: Number,
    },
    botId: {required: true, type: String },
    wantedMob: {required: true, type: String || Array },
    state_type: {required: true, type: String },
    location: {required: false, type: Object }
})

export default StateSchema