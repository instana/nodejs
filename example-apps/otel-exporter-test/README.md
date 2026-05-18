# OpenTelemetry Exporter Test App

A comprehensive Express.js application for testing OpenTelemetry tracing with Instana backend, including HTTP, PostgreSQL, and Kafka instrumentation.

## Features

- **HTTP tracing**: Express.js REST API with external HTTP calls
- **PostgreSQL tracing**: Database queries with pg driver
- **Kafka tracing**: Message producer and consumer
- **OpenTelemetry auto-instrumentation**: Automatic tracing for all operations
- **OTLP HTTP exporter**: Configured for Instana backend
- **Debug logging**: Console output for spans

## Prerequisites

1. **PostgreSQL** running on `localhost:5432`
   - Database: `nodedb`
   - User: `node`
   - Password: `nodepw`

2. **Kafka** running on `localhost:9092`
   - Topic: `test-topic` (will be created automatically)

3. **Instana** account with OTLP endpoint access

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure PostgreSQL

```bash
# Create database and user
psql -U postgres
CREATE DATABASE nodedb;
CREATE USER node WITH PASSWORD 'nodepw';
GRANT ALL PRIVILEGES ON DATABASE nodedb TO node;
```

### 3. Configure Kafka

Make sure Kafka is running on `localhost:9092`. If using Docker:

```bash
docker run -d --name kafka \
  -p 9092:9092 \
  -e KAFKA_ZOOKEEPER_CONNECT=zookeeper:2181 \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
  confluentinc/cp-kafka:latest
```

### 4. Update Instana Configuration

Edit `tracing.js` and update:
- `url`: Your Instana OTLP endpoint
- `x-instana-key`: Your Instana API key

### 5. Start the Application

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## API Endpoints

### 1. HTTP Entry + HTTP Exit

Tests HTTP client instrumentation with external API call.

```bash
curl http://localhost:3000/external-api
```

**Expected trace:**
- HTTP server span (Express)
- HTTP client span (fetch to jsonplaceholder.typicode.com)

### 2. HTTP Entry + PostgreSQL Exit

Tests PostgreSQL database instrumentation.

```bash
curl http://localhost:3000/db
```

**Expected trace:**
- HTTP server span (Express)
- PostgreSQL query span

### 3. HTTP Entry + Kafka Exit

Tests Kafka producer instrumentation.

```bash
curl -X POST http://localhost:3000/kafka \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello from OpenTelemetry!"}'
```

**Expected trace:**
- HTTP server span (Express)
- Kafka producer span
- Kafka consumer span (async, separate trace)

## Tracing Details

The application automatically traces:

### HTTP Operations
- Express route handlers
- Outgoing HTTP requests (fetch/axios)
- Request/response details

### PostgreSQL Operations
- SQL queries
- Connection details
- Query parameters

### Kafka Operations
- Message production
- Message consumption
- Topic and partition information
- Custom attributes via hooks

## Viewing Traces

1. Make requests to the API endpoints
2. Check console output for span details
3. View traces in your Instana dashboard

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
psql -h localhost -U node -d nodedb
```

### Kafka Connection Issues

```bash
# Check if Kafka is running
nc -zv localhost 9092

# List topics
kafka-topics --list --bootstrap-server localhost:9092
```

### OpenTelemetry Issues

- Check console output for initialization messages
- Verify OTLP endpoint is accessible
- Ensure API key is correct
- Set log level to `DiagLogLevel.DEBUG` in `tracing.js` for more details

## Configuration

### Disable Console Exporter

In `tracing.js`, comment out:

```javascript
// provider.addSpanProcessor(new SimpleSpanProcessor(consoleExporter));
```

### Change Service Name

In `tracing.js`, update:

```javascript
[SemanticResourceAttributes.SERVICE_NAME]: 'your-service-name'
```

### Disable Specific Instrumentations

In `tracing.js`, modify the `getNodeAutoInstrumentations` options:

```javascript
getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-fs': { enabled: false },
  '@opentelemetry/instrumentation-dns': { enabled: false }
})
```

## Docker Setup (Optional)

For running PostgreSQL and Kafka in Docker:

```bash
# PostgreSQL
docker run -d --name postgres \
  -e POSTGRES_USER=node \
  -e POSTGRES_PASSWORD=nodepw \
  -e POSTGRES_DB=nodedb \
  -p 5432:5432 \
  postgres:15

# Kafka (requires Zookeeper)
docker-compose up -d
```

Create a `docker-compose.yml`:

```yaml
version: '3'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
  
  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
```

## License

MIT