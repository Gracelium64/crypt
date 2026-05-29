import mongoose from "mongoose";

export type ProviderName = "telegram" | "whatsapp" | "mock";
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
      enum: ["telegram", "whatsapp", "mock"],
      required: true,
    },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    chatId: { type: String, required: true },
    providerMessageId: { type: String },
    deliveryStatus: {
      type: String,
      enum: ["queued", "sent", "mocked", "failed"],
      default: "queued",
    },
    providerResponse: { type: mongoose.Schema.Types.Mixed },
    rawText: { type: String, default: "" },
    encryptedText: { type: String, default: "" },
    decryptedText: { type: String, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
  },
  { timestamps: true },
);

export type MessageDocument = mongoose.InferSchemaType<typeof messageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Message = mongoose.model("Message", messageSchema);
