import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { Species } from '../src/models/Species';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

debug();

async function debug() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cmlre_marine';
    await mongoose.connect(uri);
    const count = await Species.countDocuments();
    console.log(`Species documents: ${count}`);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
