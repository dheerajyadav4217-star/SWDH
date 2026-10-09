const mongoose = require("mongoose");

const pairingCodeSchema = new mongoose.Schema(
  {
    // Store a hash rather than the raw code when this model is integrated.
    codeHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 128
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }
    },
    usedAt: {
      type: Date,
      default: null
    }
  },
  {
    versionKey: false
  }
);

pairingCodeSchema.index({ deviceId: 1, expiresAt: 1 });

module.exports =
  mongoose.models.PairingCode || mongoose.model("PairingCode", pairingCodeSchema);
