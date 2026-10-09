const mongoose = require("mongoose");

let connectionPromise = null;

async function connectDatabase() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is missing. Add it to the root .env file.");
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000
  }).then(() => {
    console.log("MongoDB connected.");
    return mongoose.connection;
  }).catch((error) => {
    connectionPromise = null;
    console.error("MongoDB connection failed:", error.message);
    throw error;
  });

  return connectionPromise;
}

module.exports = { connectDatabase };
