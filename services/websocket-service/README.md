# websocket-service/README.md (updated for high-scale cluster)

## High-Scale Setup for Millions of Connections

This service uses:
- **Node.js Cluster**: Multi-process per CPU core for vertical scaling.
- **Socket.IO Redis Adapter**: Horizontal scaling across multiple instances/servers via shared Redis pub/sub.
- **Shared RabbitMQ**: For event-driven broadcasts from other services.
- **Load Balancer**: Use Nginx/Haproxy with sticky sessions (if LB_STICKY_SESSIONS=true) or IP hash for even distribution.

### Startup

1. Ensure Docker mounts `/app/shared` with `redis.js` and `rabbitmq.js`.
2. Copy `.env.example` to `.env`: Set `CLUSTER_WORKERS` to CPU cores (e.g., 8).
3. Install: `npm install`
4. Dev: `npm run dev` (single worker)
5. Production Cluster: `npm run cluster` (master forks workers)
6. Scale Horizontally: Deploy multiple instances behind LB, all sharing Redis/RabbitMQ.

### Best Practices (2025)

- **Vertical**: Cluster uses all cores; tune `maxHttpBufferSize` for payloads.
- **Horizontal**: Redis adapter syncs broadcasts; monitor Redis memory (>1GB for millions).
- **HA/Master Alive**: Master heartbeats in Redis (TTL 30s). Use Kubernetes for auto-scaling/failover.
- **Monitoring**: Add Prometheus metrics for connections/messages/sec.
- **Limits**: Each worker ~10k-50k conns; scale to 100+ instances for 1M+.
- **Tuning**: Enable compression; use WebSocket over polling; Gzip responses.

### Integration

Other services publish to RabbitMQ `events_topic` with `realtime.<event>` (e.g., `realtime.notification`).
Payload: `{ data: {}, rooms: ['user:123'], targetUserIds: [] }`

Clients: Connect with auth token, join rooms like `user:${id}`, `company:${id}`.

### Testing Scale

Simulate load: Use Artillery or WebSocket load tools to test 10k+ conns per instance.

For full millions: Deploy on AWS/EC2 with Auto Scaling Group, ELB.