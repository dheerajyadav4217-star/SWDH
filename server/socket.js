const { Server } = require("socket.io");

function attachSocketServer(httpServer, options = {}) {
  const allowedOrigin = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map((item) => item.trim())
    : true;

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"]
    }
  });

  // Prototype presence map. This is not secure authentication:
  // clients must not be trusted solely because they claim a deviceId.
  const connectedSockets = new Map();

  io.on("connection", (socket) => {
    const deviceId = typeof socket.handshake.auth?.deviceId === "string"
      ? socket.handshake.auth.deviceId.trim().slice(0, 160)
      : "";

    if (!deviceId) {
      socket.disconnect(true);
      return;
    }

    connectedSockets.set(socket.id, deviceId);
    socket.join(`device:${deviceId}`);
    io.emit("presence:update", {
      deviceId,
      online: true
    });

    socket.on("message:send", (payload = {}, callback) => {
      const reply = typeof callback === "function" ? callback : () => {};
      const toDeviceId = typeof payload.toDeviceId === "string"
        ? payload.toDeviceId.trim().slice(0, 160)
        : "";
      const messageText = typeof payload.text === "string"
        ? payload.text.trim().slice(0, 5000)
        : "";

      if (!toDeviceId || !messageText) {
        reply({ ok: false, error: "Recipient and message text are required." });
        return;
      }

      // This transport-level prototype does not persist messages or validate
      // pairings. The REST API/database integration must enforce both.
      const message = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        fromDeviceId: deviceId,
        toDeviceId,
        text: messageText,
        createdAt: new Date().toISOString()
      };

      io.to(`device:${toDeviceId}`).emit("message:new", message);
      socket.emit("message:new", message);
      reply({ ok: true, message });
    });

    socket.on("disconnect", () => {
      connectedSockets.delete(socket.id);
      const stillOnline = [...connectedSockets.values()].includes(deviceId);
      if (!stillOnline) {
        io.emit("presence:update", {
          deviceId,
          online: false
        });
      }
    });
  });

  return io;
}

module.exports = { attachSocketServer };
