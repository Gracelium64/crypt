import mongoose from "mongoose";

const linkSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    provider: { type: String, enum: ["telegram", "whatsapp"], required: true },
    providerChatId: { type: String },
    providerDisplayName: { type: String },
    completed: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    claimedAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
  },
  { timestamps: true },
);

export type LinkDocument = mongoose.InferSchemaType<typeof linkSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Link = mongoose.model("Link", linkSchema);
