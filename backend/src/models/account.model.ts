import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    displayName: { type: String },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export type AccountDocument = mongoose.InferSchemaType<typeof accountSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Account = mongoose.model("Account", accountSchema);
