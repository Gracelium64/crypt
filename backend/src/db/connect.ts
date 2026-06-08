import mongoose from "mongoose";
import { env } from "../config/env.js";

export const connectToDatabase = async () => {
  
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB");
};
