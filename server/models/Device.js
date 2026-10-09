const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    // Prototype identifier only. Later, bind this to verified device authentication.
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 160
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 60
    },
    platform: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "web"
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false,
    timestamps: false
  }
);

module.exports = mongoose.models.Device || mongoose.model("Device", deviceSchema);
