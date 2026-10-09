const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const { connectDatabase } = require("./config/database");
const Device = require("./models/Device");
const Pairing = require("./models/Pairing");
const Message = require("./models/Message");
const SharedFile = require("./models/SharedFile");
const PairingCode = require("./models/PairingCode");
const { attachSocketServer } = require("./socket");

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

const CLIENT_ORIGINS = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map(origin => origin.trim())
  : true;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

const UPLOAD_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(cors({
  origin: CLIENT_ORIGINS,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Device-Id"]
}));

app.use(express.json({ limit: "1mb" }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

function deviceIdFrom(req) {
  return String(
    req.get("X-Device-Id") ||
    req.body?.deviceId ||
    req.query?.deviceId ||
    ""
  ).trim().slice(0, 160);
}

function safeDevice(device) {
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    platform: device.platform,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt
  };
}

async function requireDevice(req, res, next) {
  try {
    const deviceId = deviceIdFrom(req);

    if (!deviceId) {
      return res.status(401).json({
        message: "Register this device first."
      });
    }

    const device = await Device.findOne({ deviceId });

    if (!device) {
      return res.status(401).json({
        message: "Device is not registered."
      });
    }

    req.deviceId = deviceId;
    req.device = device;

    Device.updateOne(
      { _id: device._id },
      { $set: { lastSeenAt: new Date() } }
    ).catch(() => {});

    next();
  } catch (error) {
    next(error);
  }
}

async function pairedWith(deviceA, deviceB) {
  if (!deviceA || !deviceB) {
    return false;
  }

  return Boolean(await Pairing.findOne({
    status: "active",
    $or: [
      { deviceA, deviceB },
      { deviceA: deviceB, deviceB: deviceA }
    ]
  }));
}

function hashCode(code) {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, UPLOAD_DIR);
    },

    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname)
        .slice(0, 12)
        .replace(/[^.\w-]/g, "");

      callback(null, `${crypto.randomUUID()}${ext}`);
    }
  }),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10
  }
});

app.get("/", (_req, res) => {
  res.json({
    name: "Swdh API",
    status: "running"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status:
      mongoose.connection.readyState === 1
        ? "ok"
        : "database-disconnected"
  });
});

app.post("/register", asyncRoute(async (req, res) => {
  const deviceName = String(
    req.body?.deviceName || ""
  ).trim().slice(0, 60);

  const deviceId = String(
    req.body?.deviceId || crypto.randomUUID()
  ).trim().slice(0, 160);

  if (!deviceName || !deviceId) {
    return res.status(400).json({
      message: "Device name and ID are required."
    });
  }

  const device = await Device.findOneAndUpdate(
    { deviceId },
    {
      $set: {
        deviceName,
        lastSeenAt: new Date()
      },
      $setOnInsert: {
        deviceId,
        platform: "web"
      }
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );

  res.json({
    message: "Device registered.",
    device: safeDevice(device)
  });
}));

app.get("/devices", requireDevice, asyncRoute(async (req, res) => {
  const pairs = await Pairing.find({
    status: "active",
    $or: [
      { deviceA: req.deviceId },
      { deviceB: req.deviceId }
    ]
  }).lean();

  const ids = [
    ...new Set(
      pairs.map(p =>
        p.deviceA === req.deviceId
          ? p.deviceB
          : p.deviceA
      )
    )
  ];

  const devices = await Device.find({
    deviceId: { $in: ids }
  }).lean();

  res.json({
    devices: devices.map(safeDevice)
  });
}));

app.post("/pairing/code", requireDevice, asyncRoute(async (req, res) => {
  await PairingCode.deleteMany({
    deviceId: req.deviceId
  });

  const code = String(
    crypto.randomInt(0, 1000000)
  ).padStart(6, "0");

  const expiresAt = new Date(
    Date.now() + PAIRING_CODE_TTL_MS
  );

  await PairingCode.create({
    codeHash: hashCode(code),
    deviceId: req.deviceId,
    expiresAt
  });

  res.json({
    code,
    expiresInSeconds: PAIRING_CODE_TTL_MS / 1000
  });
}));

app.post("/pairing/verify", requireDevice, asyncRoute(async (req, res) => {
  const code = String(
    req.body?.code || ""
  ).trim();

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({
      message: "Enter a valid 6-digit code."
    });
  }

  const record = await PairingCode.findOneAndDelete({
    codeHash: hashCode(code),
    deviceId: { $ne: req.deviceId },
    expiresAt: { $gt: new Date() },
    usedAt: null
  });

  if (!record) {
    return res.status(404).json({
      message: "Code is invalid, expired, or already used."
    });
  }

  const existing = await Pairing.findOne({
    $or: [
      {
        deviceA: req.deviceId,
        deviceB: record.deviceId
      },
      {
        deviceA: record.deviceId,
        deviceB: req.deviceId
      }
    ]
  });

  if (!existing) {
    await Pairing.create({
      deviceA: req.deviceId,
      deviceB: record.deviceId,
      status: "active"
    });
  } else if (existing.status !== "active") {
    existing.status = "active";
    await existing.save();
  }

  const device = await Device.findOne({
    deviceId: record.deviceId
  });

  res.json({
    message: "Device paired successfully.",
    device: device ? safeDevice(device) : null
  });
}));