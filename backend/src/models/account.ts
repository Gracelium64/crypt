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

const Account = mongoose.model("Account", accountSchema);
export default Account;
