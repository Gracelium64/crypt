import mongoose from "mongoose";
import { connectToDatabase } from "../db/index.js";
import { Key } from "../models/index.js";

(async () => {
  await connectToDatabase();
  const db = mongoose.connection.db!;
  const backup = await db.collection("keys_backup_pre_migration").find({}).toArray();
  if (backup.length === 0) {
    console.error("No backup found in keys_backup_pre_migration — aborting");
    process.exit(1);
  }
  await Key.deleteMany({});
  await Key.insertMany(backup.map(({ _id, ...rest }) => ({ _id, ...rest })));
  console.log(`Restored ${backup.length} keys from backup`);
  await mongoose.disconnect();
  process.exit(0);
})();
