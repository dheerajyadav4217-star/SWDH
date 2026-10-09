const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
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
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 5000
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
      immutable: true
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  {
    versionKey: false
  }
);

messageSchema.index({ fromDeviceId: 1, toDeviceId: 1, createdAt: 1 });
messageSchema.index({ toDeviceId: 1, createdAt: -1 });

module.exports = mongoose.models.Message || mongoose.model("Message", messageSchema);
