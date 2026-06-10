import mongoose from "mongoose";

const providerConnectionSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: false,
      default: null,
    },
    provider: { type: String, enum: ["telegram", "whatsapp"], required: true },
    providerChatId: { type: String, required: true },
    displayName: { type: String },
    username: { type: String, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ProviderConnectionDocument = mongoose.InferSchemaType<
  typeof providerConnectionSchema
> & {
  _id: mongoose.Types.ObjectId;
};

const ProviderConnection = mongoose.model(
  "ProviderConnection",
  providerConnectionSchema,
);
export default ProviderConnection;
