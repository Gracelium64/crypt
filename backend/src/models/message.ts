import mongoose from "mongoose";

export type ProviderName = "telegram" | "whatsapp";
export type MessageDirection = "inbound" | "outbound";

const attachmentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["image"], required: true },
    url: { type: String, required: true },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["telegram", "whatsapp"],
      required: true,
    },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    chatId: { type: String, required: true },
    providerMessageId: { type: String },
    deliveryStatus: {
      type: String,
      enum: ["queued", "sent", "failed"],
      default: "queued",
    },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", index: true },
    encryptedText: { type: String, default: "" },
    bodyOmitted: { type: Boolean, default: false },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { timestamps: true },
);

export type MessageDocument = mongoose.InferSchemaType<typeof messageSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Message = mongoose.model("Message", messageSchema);
export default Message;
