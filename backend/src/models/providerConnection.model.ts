import mongoose from "mongoose";

const providerConnectionSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    provider: { type: String, enum: ["telegram", "whatsapp"], required: true },
    providerChatId: { type: String, required: true },
    displayName: { type: String },
    // Optional encrypted token stored for this connection (encrypted with server master key)
    encryptedToken: { type: String },
    // Optional metadata stored as mixed
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type ProviderConnectionDocument = mongoose.InferSchemaType<
  typeof providerConnectionSchema
> & {
  _id: mongoose.Types.ObjectId;
};

export const ProviderConnection = mongoose.model(
  "ProviderConnection",
  providerConnectionSchema,
);
