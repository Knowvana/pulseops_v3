// ============================================================================
// Google GKE Module — Pub/Sub Monitoring Routes
//
// PURPOSE: Handles all Google Cloud Pub/Sub monitoring endpoints. Pub/Sub is
// Google's asynchronous messaging service used for event-driven architectures,
// data streaming, and inter-service communication.
//
// WHAT IS GOOGLE CLOUD PUB/SUB?
//   Pub/Sub is a fully managed messaging service that decouples services:
//
//   - Topic:        A named channel where messages are published.
//                   Example: "identity-events", "audit-logs", "access-requests"
//
//   - Subscription: A consumer that receives messages from a topic.
//                   Can be pull-based or push-based.
//                   Example: "identity-processor-sub", "audit-archiver-sub"
//
//   - Message:      A unit of data published to a topic.
//                   Contains: data (bytes), attributes (key-value), messageId, publishTime
//
//   - Dead Letter:  Messages that fail processing after max delivery attempts.
//                   Routed to a dead-letter topic for investigation.
//
//   Message flow:
//     Publisher → Topic → Subscription(s) → Subscriber(s)
//                    ↓
//              Dead Letter Topic (on repeated failure)
//
// ACCESSIO-SPECIFIC PUB/SUB USAGE:
//   - Identity change events (ForgeRock → processing pipeline)
//   - Access request notifications (Sailpoint → notification service)
//   - Audit log streaming (all services → audit aggregator)
//   - Compliance event triggers (scheduler → compliance engine)
//
// LOCAL DEVELOPMENT vs GCP:
//   LOCAL (Kind + Podman):
//     - Uses Google Cloud Pub/Sub Emulator (runs as a container)
//     - Emulator provides the same API as real Pub/Sub
//     - Set PUBSUB_EMULATOR_HOST env var to point to emulator
//     - PubsubService.js auto-detects emulator via env var
//
//   GCP (Production):
//     - Uses real Google Cloud Pub/Sub API
//     - Auth via GKE Workload Identity (service account auto-injected)
//     - PubsubService.js uses @google-cloud/pubsub npm package
//
// ROUTES (all relative to /api/google_gke):
//   GET  /pubsub/topics          → List all Pub/Sub topics
//   GET  /pubsub/subscriptions   → List all subscriptions with metrics
//   GET  /pubsub/metrics         → Get aggregated Pub/Sub metrics
//   GET  /pubsub/dead-letters    → List dead-letter messages
//
// PATTERN SOURCE: Follows HealthCheck module's routes pattern
// ============================================================================
import { Router } from 'express';
import { createGkeLogger } from '../lib/moduleLogger.js';
import { gkeUrls, apiErrors, apiMessages } from '../config/index.js';
import { dbSchema, DatabaseService } from './helpers.js';

const log = createGkeLogger('pubsubRoutes.js');
const router = Router();
const R = gkeUrls.routes;

// ═══════════════════════════════════════════════════════════════════════════════
// GET /pubsub/topics — List all Pub/Sub topics
// ═══════════════════════════════════════════════════════════════════════════════
//
// TODO: Implement
//   1. Call PubsubService.listTopics()
//   2. For each topic: name, subscriptionCount, messagePublishRate, messageRetention
//   3. Return { success: true, data: topics }

// ═══════════════════════════════════════════════════════════════════════════════
// GET /pubsub/subscriptions — List all subscriptions with metrics
// ═══════════════════════════════════════════════════════════════════════════════
//
// TODO: Implement
//   1. Call PubsubService.listSubscriptions()
//   2. For each: name, topic, type (pull/push), ackDeadlineSeconds,
//      unackedMessageCount, oldestUnackedMessageAge, deadLetterTopic
//   3. Query params: topic (filter by topic name)

// ═══════════════════════════════════════════════════════════════════════════════
// GET /pubsub/metrics — Aggregated Pub/Sub metrics
// ═══════════════════════════════════════════════════════════════════════════════
//
// TODO: Implement
//   1. Call PubsubService.getMetrics()
//   2. Return: total topics, total subscriptions, total messages/sec,
//      backlog size, dead letter count, oldest unacked message

// ═══════════════════════════════════════════════════════════════════════════════
// GET /pubsub/dead-letters — Dead letter messages
// ═══════════════════════════════════════════════════════════════════════════════
//
// TODO: Implement
//   1. Call PubsubService.getDeadLetters()
//   2. Return: messageId, originalTopic, subscription, data, attributes,
//      publishTime, deliveryAttempt
//   3. Query params: topic, limit

export default router;
