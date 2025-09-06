🐇 RabbitMQ Service – Invexis

This service provides centralized messaging for the Invexis microservices ecosystem.
It manages RabbitMQ connections, queues, exchanges, producers, and consumers.
Other services can easily publish and subscribe to events without handling RabbitMQ boilerplate.

📂 Folder Structure
rabbitmq-service/
├─ src/
│  ├─ config/        # RabbitMQ connection setup (with retries)
│  ├─ queues/        # Queue & exchange declarations
│  ├─ services/      # Generic publisher & subscriber logic
│  ├─ producers/     # Event producers (publishing)
│  ├─ consumers/     # Event consumers (listening)
│  ├─ utils/         # Utility helpers (e.g. retry logic)
│  └─ index.js       # Entry point
├─ tests/            # Unit & integration tests
├─ docker/           # Service-specific Dockerfile
├─ .env              # Environment variables
├─ package.json
└─ README.md

⚙️ Environment Setup

Create a .env file:

RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
RABBITMQ_RETRIES=5
RABBITMQ_RETRY_DELAY=5000


RABBITMQ_URL → RabbitMQ broker connection (inside Docker, host is rabbitmq).

RABBITMQ_RETRIES → Number of times to retry connecting.

RABBITMQ_RETRY_DELAY → Delay (ms) between retries.

🛠️ Installation
cd rabbitmq-service
npm install


Run service:

node src/index.js

🏗️ Producers (Publishing Events)

Producers are functions that send events to RabbitMQ exchanges.

Example: src/producers/orderProducer.js

const { publish } = require("../services/publisher");
const { EXCHANGES } = require("../queues");

async function orderCreated(order) {
  await publish(EXCHANGES.ORDER, {
    type: "order.created",
    data: order,
    timestamp: new Date(),
  });
}

module.exports = { orderCreated };


✅ Usage in another service:

const { orderCreated } = require("rabbitmq-service/src/producers/orderProducer");

orderCreated({ id: "123", items: ["apple", "banana"] });

📥 Consumers (Listening to Events)

Consumers are functions that listen to queues and handle events.

Example: src/consumers/orderConsumer.js

const { subscribe } = require("../services/subscriber");
const { QUEUES } = require("../queues");

async function orderConsumer() {
  await subscribe(QUEUES.ORDER, async (msg) => {
    console.log("🛒 [Order Consumer] Received:", msg);
    // Add business logic here
  });
}

module.exports = { orderConsumer };


✅ Consumers are started in src/index.js:

const { orderConsumer } = require("./consumers/orderConsumer");
orderConsumer();

🐳 Docker Support

Each service in Invexis has its own Dockerfile.

Example: docker/Dockerfile

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["node", "src/index.js"]


Build & run:

docker build -t invexis-rabbitmq-service ./docker
docker run --env-file .env invexis-rabbitmq-service


👉 Orchestrate all services (auth, inventory, rabbitmq, etc.) at the root project level using docker-compose.yml or Kubernetes.

🧪 Testing

Run tests:

npm test


Example test file: tests/rabbitmq.test.js

🚀 Adding a New Event

Declare queue & exchange in src/queues/index.js

Create producer in src/producers/

Create consumer in src/consumers/

Register consumer in src/index.js

👨‍💻 Developer Notes

Keep producers & consumers event-specific (don’t mix responsibilities).

Don’t hardcode queue/exchange names in business logic — always use src/queues/index.js.

Use .env variables for anything environment-dependent.

This service must run before other Invexis microservices that depend on messaging.

📌 Summary

The RabbitMQ service is the communication backbone of Invexis.
It ensures services remain decoupled, scalable, and maintainable.

Producers → publish events

Consumers → handle events

Centralized config → consistent queue/exchange setup

Dockerized → ready for deployment