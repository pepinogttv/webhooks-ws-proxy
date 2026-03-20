'use strict';

const MAX_CHANNELS = parseInt(process.env.MAX_CHANNELS, 10) || 10000;
const BUFFER_SIZE = parseInt(process.env.WEBHOOK_BUFFER_SIZE, 10) || 50;
const RATE_LIMIT = parseInt(process.env.WEBHOOK_RATE_LIMIT, 10) || 60;
const CHANNEL_IDLE_TTL = (parseInt(process.env.CHANNEL_IDLE_TTL_HOURS, 10) || 24) * 3600000;
const BUFFER_TTL = 30 * 60 * 1000;

const channels = new Map();
let nextWebhookId = 1;

function createChannelState(channelId) {
  return {
    channelId,
    connectedSockets: 0,
    webhookBuffer: [],
    lastActivity: Date.now(),
    totalReceived: 0,
    rateWindow: [],
  };
}

function getOrCreate(channelId) {
  let channel = channels.get(channelId);
  if (!channel) {
    if (channels.size >= MAX_CHANNELS) {
      throw new Error(`Max channels (${MAX_CHANNELS}) reached`);
    }
    channel = createChannelState(channelId);
    channels.set(channelId, channel);
  }
  return channel;
}

function bufferWebhook(channelId, webhookData) {
  const channel = getOrCreate(channelId);
  const entry = {
    id: nextWebhookId++,
    data: webhookData,
    timestamp: Date.now(),
  };

  channel.webhookBuffer.push(entry);

  if (channel.webhookBuffer.length > BUFFER_SIZE) {
    channel.webhookBuffer.shift();
  }

  channel.lastActivity = Date.now();
  channel.totalReceived++;

  return entry;
}

function getBuffered(channelId) {
  const channel = channels.get(channelId);
  if (!channel) return [];
  return channel.webhookBuffer;
}

function clearBuffered(channelId, upToId) {
  const channel = channels.get(channelId);
  if (!channel) return;
  channel.webhookBuffer = channel.webhookBuffer.filter((w) => w.id > upToId);
}

function incrementSockets(channelId) {
  const channel = getOrCreate(channelId);
  channel.connectedSockets++;
  channel.lastActivity = Date.now();
  return channel.connectedSockets;
}

function decrementSockets(channelId) {
  const channel = channels.get(channelId);
  if (!channel) return 0;
  channel.connectedSockets = Math.max(0, channel.connectedSockets - 1);
  channel.lastActivity = Date.now();
  return channel.connectedSockets;
}

function getStats(channelId) {
  const channel = channels.get(channelId);
  if (!channel) {
    return { connectedSockets: 0, bufferedCount: 0, totalReceived: 0 };
  }
  return {
    connectedSockets: channel.connectedSockets,
    bufferedCount: channel.webhookBuffer.length,
    totalReceived: channel.totalReceived,
  };
}

function checkRateLimit(channelId) {
  const channel = getOrCreate(channelId);
  const now = Date.now();
  const windowStart = now - 60000;

  channel.rateWindow = channel.rateWindow.filter((ts) => ts > windowStart);

  if (channel.rateWindow.length >= RATE_LIMIT) {
    return false;
  }

  channel.rateWindow.push(now);
  return true;
}

function cleanup() {
  const now = Date.now();
  const bufferCutoff = now - BUFFER_TTL;

  for (const [channelId, channel] of channels) {
    // Remove idle channels with no connected sockets
    if (channel.connectedSockets === 0 && now - channel.lastActivity > CHANNEL_IDLE_TTL) {
      channels.delete(channelId);
      continue;
    }

    // Evict stale webhooks from buffers
    channel.webhookBuffer = channel.webhookBuffer.filter((w) => w.timestamp > bufferCutoff);
  }
}

module.exports = {
  getOrCreate,
  bufferWebhook,
  getBuffered,
  clearBuffered,
  incrementSockets,
  decrementSockets,
  getStats,
  checkRateLimit,
  cleanup,
};
