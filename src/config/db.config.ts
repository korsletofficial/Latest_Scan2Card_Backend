import mongoose from "mongoose";

let isConnected = false;

export const connectToMongooseDatabase = async () => {
  if (isConnected) {
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/scan2card";

    // Connection options optimized for high concurrency
    await mongoose.connect(mongoUri, {
      maxPoolSize: 100, // Maximum number of connections in the pool (up from default 5)
      minPoolSize: 10, // Minimum number of connections to maintain
      serverSelectionTimeoutMS: 5000, // Timeout for selecting a server
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      maxIdleTimeMS: 30000, // Remove connections from pool after 30s idle
      family: 4, // Use IPv4, skip trying IPv6
    });

    isConnected = true;
    console.log("✅ MongoDB connected successfully with optimized pool settings", {
      maxPoolSize: 100,
      minPoolSize: 10,
    });
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    throw error;
  }
};
