import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    const db = mongoose.connection.db!;
    const result = await db.collection('crmtokens').deleteMany({});
    console.log('Deleted CRM tokens:', result.deletedCount);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
