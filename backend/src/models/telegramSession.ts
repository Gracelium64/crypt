import mongoose from "mongoose";

const telegramSessionSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },
    phoneNumber: { type: String, required: true },
    sessionString: { type: String, default: "" },
    active: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export type TelegramSessionDocument = mongoose.InferSchemaType<
  typeof telegramSessionSchema
> & { _id: mongoose.Types.ObjectId };

const TelegramSession = mongoose.model("TelegramSession", telegramSessionSchema);
export default TelegramSession;
