"use strict";

const { exchanges } = require("/app/shared/rabbitmq");

module.exports = [
  {
    name: "Notification Lifecycle Events",
    exchange: exchanges.topic,
    events: [
      { key: "notification.created", description: "A new notification was created" },
      { key: "notification.sent", description: "Notification sent to user" },
      { key: "notification.delivered", description: "Notification delivered successfully" },
      { key: "notification.failed", description: "Notification delivery failed" },
      { key: "notification.read", description: "User read the notification" },
      { key: "notification.deleted", description: "Notification was deleted" },
    ],
  },
  {
    name: "Realtime Notification Events",
    exchange: exchanges.topic,
    events: [
      { key: "realtime.notification", description: "Real-time notification for WebSocket service" },
    ],
  },
];

