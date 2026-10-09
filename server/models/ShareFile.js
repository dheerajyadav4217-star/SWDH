const mongoose = require("mongoose");

const sharedFileSchema = new mongoose.Schema(
  {
    fromDeviceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      index: true
    },
    toDeviceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      index: true
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255
    },
    storageKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 300
    },
    mimeType: {
      type: String,
      default: "application/octet-stream",
      maxlength: 150
    },
    size: {
      type: Number,
      required: true,
      min: 0
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }
    }
  },
  {
    versionKey: false
  }
);

sharedFileSchema.index({ fromDeviceId: 1, toDeviceId: 1, createdAt: -1 });
sharedFileSchema.index({ toDeviceId: 1, createdAt: -1 });

module.exports =
  mongoose.models.SharedFile || mongoose.model("SharedFile", sharedFileSchema);
