import mongoose from "mongoose";
import { connectToDatabase } from "../db/index.js";
import { Key } from "../models/index.js";

(async () => {
  await connectToDatabase();
  const keys = await Key.find({}).lean();
  const db = mongoose.connection.db!;
  await db.collection("keys_backup_pre_migration").insertMany(
    keys.map(k => ({ ...k }))
  );
  console.log(`Backed up ${keys.length} keys to keys_backup_pre_migration`);
  await mongoose.disconnect();
  process.exit(0);
})();
