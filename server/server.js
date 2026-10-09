const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "swdh-data.json");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const PAIR_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// This is a starter backend using a local JSON file.
// It is suitable for local development only; persistent production storage,
// strong device authentication, and cloud file storage must be added before deployment.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map((item) => item.trim())
    : true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Device-Id"]
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});
app.use(apiLimiter);

function readStore() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { devices: [], pairingCodes: [], pairings: [], messages: [], files: [] };
    }
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return {
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      pairingCodes: Array.isArray(parsed.pairingCodes) ? parsed.pairingCodes : [],
      pairings: Array.isArray(parsed.pairings) ? parsed.pairings : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      files: Array.isArray(parsed.files) ? parsed.files : []
    };
  } catch (error) {
    console.error("Could not read local data store:", error.message);
    throw new Error("Data store is unreadable. Back up and repair server/data/swdh-data.json.");
  }
}

let store = readStore();
let writeQueue = Promise.resolve();

function saveStore() {
  const snapshot = JSON.stringify(store, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tempFile = `${DB_FILE}.tmp`;
    await fs.promises.writeFile(tempFile, snapshot, "utf8");
    await fs.promises.rename(tempFile, DB_FILE);
  });
  return writeQueue;
}

function cleanString(value, maxLength = 100) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function getDeviceId(req) {
  return cleanString(req.get("X-Device-Id") || req.body?.deviceId || req.query?.deviceId, 160);
}

function findDevice(deviceId) {
  return store.devices.find((device) => device.deviceId === deviceId);
}

function requireRegisteredDevice(req, res, next) {
  const deviceId = getDeviceId(req);
  if (!deviceId || !findDevice(deviceId)) {
    return res.status(401).json({ error: "Device not registered. Register this device first." });
  }
  req.deviceId = deviceId;
  next();
}

function publicDevice(device) {
  return {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt
  };
}

function isPaired(deviceA, deviceB) {
  return store.pairings.some((pairing) =>
    (pairing.deviceA === deviceA && pairing.deviceB === deviceB) ||
    (pairing.deviceA === deviceB && pairing.deviceB === deviceA)
  );
}

function pruneExpiredCodes() {
  const now = Date.now();
  store.pairingCodes = store.pairingCodes.filter((item) => item.expiresAt > now);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get("/", (_req, res) => {
  res.json({
    name: "Swdh API",
    status: "running",
    environment: NODE_ENV,
    note: "Local-development starter. Device IDs are not secure authentication."
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Register a browser/device for this prototype.
// IMPORTANT: a client-supplied deviceId is not proof of identity.
app.post("/register", asyncRoute(async (req, res) => {
  const deviceName = cleanString(req.body?.deviceName, 60);
  let deviceId = cleanString(req.body?.deviceId, 160);

  if (!deviceName) {
    return res.status(400).json({ error: "Please provide a device name." });
  }

  if (!deviceId) deviceId = crypto.randomUUID();

  let device = findDevice(deviceId);
  const now = new Date().toISOString();

  if (device) {
    device.deviceName = deviceName;
    device.lastSeenAt = now;
  } else {
    device = { deviceId, deviceName, createdAt: now, lastSeenAt: now };
    store.devices.push(device);
  }

  await saveStore();
  res.status(200).json({ message: "Device registered.", device: publicDevice(device) });
}));

app.get("/devices", requireRegisteredDevice, (req, res) => {
  const pairedIds = new Set();
  for (const pairing of store.pairings) {
    if (pairing.deviceA === req.deviceId) pairedIds.add(pairing.deviceB);
    if (pairing.deviceB === req.deviceId) pairedIds.add(pairing.deviceA);
  }
  const devices = [...pairedIds]
    .map((id) => findDevice(id))
    .filter(Boolean)
    .map(publicDevice);
  res.json({ devices });
});

// Create a short-lived one-time pairing code.
app.post("/pairing/code", requireRegisteredDevice, asyncRoute(async (req, res) => {
  pruneExpiredCodes();
  store.pairingCodes = store.pairingCodes.filter((item) => item.deviceId !== req.deviceId);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const now = Date.now();
  store.pairingCodes.push({
    code,
    deviceId: req.deviceId,
    createdAt: now,
    expiresAt: now + PAIR_CODE_TTL_MS
  });
  await saveStore();
  res.json({ code, expiresInSeconds: PAIR_CODE_TTL_MS / 1000 });
}));

app.post("/pairing/verify", requireRegisteredDevice, asyncRoute(async (req, res) => {
  pruneExpiredCodes();
  const code = cleanString(req.body?.code, 10);
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "Enter a valid 6-digit pairing code." });
  }

  const codeIndex = store.pairingCodes.findIndex((item) =>
    item.code === code && item.deviceId !== req.deviceId && item.expiresAt > Date.now()
  );
  if (codeIndex < 0) {
    return res.status(404).json({ error: "Code is invalid, expired, or belongs to this device." });
  }

  const [pairingCode] = store.pairingCodes.splice(codeIndex, 1);
  if (!isPaired(req.deviceId, pairingCode.deviceId)) {
    store.pairings.push({
      deviceA: req.deviceId,
      deviceB: pairingCode.deviceId,
      createdAt: new Date().toISOString()
    });
  }
  await saveStore();

  res.json({
    message: "Devices paired successfully.",
    device: publicDevice(findDevice(pairingCode.deviceId))
  });
}));

app.get("/messages", requireRegisteredDevice, (req, res) => {
  const otherDeviceId = cleanString(req.query?.deviceId, 160);
  if (!otherDeviceId || !isPaired(req.deviceId, otherDeviceId)) {
    return res.status(403).json({ error: "Pair with this device before viewing messages." });
  }
  const messages = store.messages.filter((message) =>
    (message.fromDeviceId === req.deviceId && message.toDeviceId === otherDeviceId) ||
    (message.fromDeviceId === otherDeviceId && message.toDeviceId === req.deviceId)
  );
  res.json({ messages });
});

app.post("/messages", requireRegisteredDevice, asyncRoute(async (req, res) => {
  const toDeviceId = cleanString(req.body?.toDeviceId, 160);
  const text = cleanString(req.body?.text, 5000);
  if (!toDeviceId || !text) {
    return res.status(400).json({ error: "Recipient and message text are required." });
  }
  if (!findDevice(toDeviceId) || !isPaired(req.deviceId, toDeviceId)) {
    return res.status(403).json({ error: "Pair with the recipient device first." });
  }

  const message = {
    id: crypto.randomUUID(),
    fromDeviceId: req.deviceId,
    toDeviceId,
    text,
    createdAt: new Date().toISOString()
  };
  store.messages.push(message);
  await saveStore();
  res.status(201).json({ message });
}));

// Prototype upload endpoint. Files are stored on the local filesystem, not cloud storage.
const multer = require("multer");
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const safeExtension = path.extname(file.originalname).slice(0, 12).replace(/[^.\w-]/g, "");
    callback(null, `${crypto.randomUUID()}${safeExtension}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 }
});

app.get("/files", requireRegisteredDevice, (req, res) => {
  const otherDeviceId = cleanString(req.query?.deviceId, 160);
  if (!otherDeviceId || !isPaired(req.deviceId, otherDeviceId)) {
    return res.status(403).json({ error: "Pair with this device before viewing files." });
  }
  const files = store.files.filter((file) =>
    (file.fromDeviceId === req.deviceId && file.toDeviceId === otherDeviceId) ||
    (file.fromDeviceId === otherDeviceId && file.toDeviceId === req.deviceId)
  ).map(({ diskName, ...safeFile }) => safeFile);
  res.json({ files });
});

app.post("/files", requireRegisteredDevice, upload.single("file"), asyncRoute(async (req, res) => {
  const toDeviceId = cleanString(req.body?.toDeviceId, 160);
  if (!req.file) return res.status(400).json({ error: "Select a file to upload." });
  if (!toDeviceId || !findDevice(toDeviceId) || !isPaired(req.deviceId, toDeviceId)) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(403).json({ error: "Pair with the recipient device first." });
  }

  const file = {
    id: crypto.randomUUID(),
    fromDeviceId: req.deviceId,
    toDeviceId,
    originalName: path.basename(req.file.originalname).slice(0, 255),
    diskName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    createdAt: new Date().toISOString()
  };
  store.files.push(file);
  await saveStore();
  const { diskName, ...safeFile } = file;
  res.status(201).json({ file: safeFile });
}));

app.get("/files/:id/download", requireRegisteredDevice, asyncRoute(async (req, res) => {
  const file = store.files.find((item) => item.id === req.params.id);
  if (!file || (file.fromDeviceId !== req.deviceId && file.toDeviceId !== req.deviceId)) {
    return res.status(404).json({ error: "File not found." });
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(file.diskName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Stored file is missing." });
  res.download(filePath, file.originalName);
}));

// Remove old pairing codes and orphaned expired uploads at startup and periodically.
function cleanupExpiredCodes() {
  pruneExpiredCodes();
  saveStore().catch((error) => console.error("Could not save cleanup:", error.message));
}
cleanupExpiredCodes();
const cleanupTimer = setInterval(cleanupExpiredCodes, 60 * 1000);
cleanupTimer.unref();

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File is too large. Maximum size is 25 MB." });
  }
  if (err && err.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({ error: "Upload one file at a time." });
  }
  res.status(500).json({
    error: NODE_ENV === "production" ? "Internal server error." : (err.message || "Internal server error.")
  });
});

app.listen(PORT, () => {
  console.log(`Swdh server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});
