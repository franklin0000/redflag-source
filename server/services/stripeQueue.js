const { Queue, Worker } = require('bullmq');
const db = require('../db');
const Redis = require('ioredis');

// BullMQ requires maxRetriesPerRequest to be configured to null
const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 500, 10000), // backoff, don't crash
    reconnectOnError: () => true,
    enableOfflineQueue: false,
});
connection.on('error', (err) => {
    console.error('[Redis] Connection error (non-fatal):', err.message);
});

const stripeQueue = new Queue('stripe-webhooks', { connection });

// ── DIO-LEVEL ARCHITECTURE: ASYNC WEBHOOK PROCESSING ───────────
// Detaches webhook logic from the synchronous HTTP request to guarantee
// non-blocking IO and provide robust retry capabilities on database downtime.
const worker = new Worker('stripe-webhooks', async job => {
  const { event } = job.data;
  console.log(`[Stripe Worker] Processing event: ${event.type}`);

  const idempotencyKey = `stripe_event_${event.id}`;
  const alreadyProcessed = await connection.get(idempotencyKey);
  if (alreadyProcessed) {
    console.log(`[Stripe Worker] Event ${event.id} already processed. Skipping.`);
    return;
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      if (pi.metadata?.userId) {
        await db.query('UPDATE users SET is_paid=TRUE WHERE id=$1', [pi.metadata.userId]);
        console.log(`✅ [Stripe Worker] user ${pi.metadata.userId} marked as paid`);
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      if (sub.metadata?.userId && sub.status === 'active') {
        await db.query('UPDATE users SET is_paid=TRUE WHERE id=$1', [sub.metadata.userId]);
        console.log(`✅ [Stripe Worker] subscription ${sub.status} for user ${sub.metadata.userId}`);
      }
    }

    // Mark event as processed (TTL 24h)
    await connection.setex(idempotencyKey, 86400, 'PROCESSED');
  } catch (err) {
    console.error(`[Stripe Worker] Error processing ${event.id}:`, err);
    throw err; // Trigger standard exponential backoff retry in BullMQ
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[Stripe Worker] Job ${job.id} permanently failed: ${err.message}`);
});

module.exports = { stripeQueue };
