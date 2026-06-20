import mongoose from "mongoose";

const logSchema = new mongoose.Schema(
  {
    level: { type: String, enum: ["info", "warn", "error"], required: true },
    event: { type: String, required: true },
    accountId: { type: String, default: null },
    context: { type: mongoose.Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: null },
    errorStack: { type: String, default: null },
  },
  { timestamps: true },
);

export type LogDocument = mongoose.InferSchemaType<typeof logSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Log = mongoose.model("Log", logSchema);
export default Log;
