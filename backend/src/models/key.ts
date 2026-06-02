import mongoose from "mongoose";

const keySchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, unique: true },
    publicKey: { type: String, required: true },
  },
  { timestamps: true },
);

export type KeyDocument = mongoose.InferSchemaType<typeof keySchema> & {
  _id: mongoose.Types.ObjectId;
};

const Key = mongoose.model("Key", keySchema);
export default Key;
