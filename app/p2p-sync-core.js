export const PEER_CHUNK_SIZE = 32_000;
export const MAX_PEER_CHUNKS = 4_096;
export const MAX_PEER_CHUNK_LENGTH = 40_000;
export const MAX_ACTIVE_PEER_TRANSFERS = 8;

export function createPeerSnapshotChunks(
  serialized,
  { transferId, transferType, chunkSize = PEER_CHUNK_SIZE },
) {
  const value = String(serialized ?? "");
  if (!transferId || !["sync", "reply"].includes(transferType))
    throw new Error("同步分片参数不完整");
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_PEER_CHUNK_LENGTH)
    throw new Error("同步分片大小无效");
  const total = Math.max(1, Math.ceil(value.length / chunkSize));
  if (total > MAX_PEER_CHUNKS) throw new Error("账本过大，暂时无法通过设备直连同步");
  return Array.from({ length: total }, (_, index) => ({
    type: "chunk",
    transferType,
    transferId,
    index,
    total,
    data: value.slice(index * chunkSize, (index + 1) * chunkSize),
  }));
}

export function acceptPeerSnapshotChunk(transfers, message) {
  if (
    !transfers ||
    message?.type !== "chunk" ||
    !message.transferId ||
    !["sync", "reply"].includes(message.transferType) ||
    !Number.isInteger(message.index) ||
    !Number.isInteger(message.total) ||
    message.total < 1 ||
    message.total > MAX_PEER_CHUNKS ||
    message.index < 0 ||
    message.index >= message.total ||
    typeof message.data !== "string" ||
    message.data.length > MAX_PEER_CHUNK_LENGTH
  )
    return { status: "ignored" };

  let transfer = transfers.get(message.transferId);
  if (!transfer) {
    if (transfers.size >= MAX_ACTIVE_PEER_TRANSFERS) {
      const oldestTransferId = transfers.keys().next().value;
      if (oldestTransferId) transfers.delete(oldestTransferId);
    }
    transfer = {
      transferType: message.transferType,
      total: message.total,
      parts: Array(message.total).fill(null),
      received: 0,
    };
    transfers.set(message.transferId, transfer);
  } else if (
    transfer.transferType !== message.transferType ||
    transfer.total !== message.total
  ) {
    return { status: "ignored" };
  }

  if (transfer.parts[message.index] === null) {
    transfer.parts[message.index] = message.data;
    transfer.received += 1;
  }
  if (transfer.received < transfer.total)
    return {
      status: "partial",
      received: transfer.received,
      total: transfer.total,
    };

  transfers.delete(message.transferId);
  return {
    status: "complete",
    transferType: transfer.transferType,
    serialized: transfer.parts.join(""),
    received: transfer.received,
    total: transfer.total,
  };
}
