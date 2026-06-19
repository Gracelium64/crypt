import mongoose from "mongoose";
import { connectToDatabase } from "../db/index.js";
import { Key, Account } from "../models/index.js";

(async () => {
  await connectToDatabase();
  const accounts = await Account.find({}, { _id: 1, email: 1 }).lean();
  for (const account of accounts) {
    const result = await Key.updateMany(
      { ownerId: account.email },
      { $set: { ownerId: account._id.toString() } }
    );
    console.log(`${account.email}: migrated ${result.modifiedCount} keys`);
  }
  console.log("Migration complete.");
  await mongoose.disconnect();
  process.exit(0);
})();
