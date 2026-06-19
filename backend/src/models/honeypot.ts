import mongoose from "mongoose";

const honeypotSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true },
    route: { type: String, required: true },
    method: { type: String, required: true },
    userAgent: { type: String, default: "unknown" },
  },
  { timestamps: true },
);

export type HoneypotDocument = mongoose.InferSchemaType<typeof honeypotSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Honeypot = mongoose.model("Honeypot", honeypotSchema);
export default Honeypot;
