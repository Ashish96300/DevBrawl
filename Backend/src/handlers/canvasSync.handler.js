// Canvas, Text, & Chat Synchronizer with snapshot resync support

// In-memory canvas snapshots per room (cleared on server restart)
const canvasSnapshots = new Map(); // roomId -> { elements: Map<id, element>, timestamp: number }

// In-memory code snapshots per room (cleared on server restart)
const codeSnapshots = new Map(); // roomId -> { code: string, updatedAt: number }

export const registerSyncHandlers = (io, socket) => {

  socket.on("send-message", async (payload) => {
    try {
      const { roomId, message } = payload;
      socket.to(roomId).emit("receive-message", {
        userId: socket.user._id,
        username: socket.user.username,
        message,
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit("send-message", { success: false, error: error.message });
    }
  });

  socket.on("canvas-change", (data) => {
    const roomId = data?.roomId;
    const elements = data?.elements;

    if (!roomId || !Array.isArray(elements) || elements.length === 0) return;

    const snapshot = canvasSnapshots.get(roomId) || { elements: new Map(), timestamp: 0 };
    for (const element of elements) {
      if (element?.id) snapshot.elements.set(element.id, element);
    }
    snapshot.timestamp = Date.now();
    canvasSnapshots.set(roomId, snapshot);

    socket.to(roomId).emit("receive-canvas-change", { roomId, elements });
  });

  // New joiner or reconnect asks for the full snapshot
  socket.on("canvas-state-request", (payload) => {
    const roomId = payload?.roomId;
    if (!roomId) return;

    const snapshot = canvasSnapshots.get(roomId);
    socket.emit("canvas-state-response", {
      roomId,
      elements: snapshot ? Array.from(snapshot.elements.values()) : [],
    });
  });

  socket.on("code-change", (data) => {
    if (data?.roomId && typeof data.code === "string") {
      codeSnapshots.set(data.roomId, { code: data.code, updatedAt: Date.now() });
    }
    socket.to(data.roomId).emit("receive-code-change", data);
  });

  // Reconnect / new joiner asks for current code
  socket.on("code-state-request", (payload) => {
    const roomId = payload?.roomId;
    if (!roomId) return;
    const snapshot = codeSnapshots.get(roomId);
    socket.emit("code-state-response", {
      roomId,
      code: snapshot?.code ?? "",
    });
  });

  socket.to(socket.id).emit("custom-init", { context: "sync-ready" });
};
