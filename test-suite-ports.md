Port Ranges for Test Suites
===========================

The integration test suites for individual packages (collector, aws-fargate, aws-lambde, google-cloud-run, ...) run concurrently on CI, so we need to make sure there are no port conflicts between those.

For this reason, we maintain an overview of the ports used by the integration test suites of all packages. To avoid port conflicts, this needs to include the ports for applications under test as well as auxilliary applications like agent mocks, back end mocks, proxies etc. and infrastructure componentes running in containers (databases, message brokers, ...).

| Package              | Port Range |
| -------------------- | ---------- |
| aws-fargate          | app under test: 4215, mock back end: 9443, downstream dummy: 4567, metadata endpoint mock: 1604, proxy 4128 |
| aws-lambda           | mock back end: 8443, mock Lambda extension: 7365, downstream dummy: 3456, proxy: 3128 |
| collector            | app under test: 30000 - 31000, individual mock agent: 3210, global mock agent: 3211, PostgreSQL: 5432, MongoDB: 27017, MSSQL: 1433, Elasticsearch: 9200, Redis: 6379, NATS: 4222, 4223, Kafka: 9092 and 29092, Schema Registry: 8081, RabbitMQ: 5672, GRPC:  50051 |
| core                 | N.A. (no integration tests, only unit tests) |
| google-cloud-run     | app under test: 4216, mock back end: 9444, downstream dummy: 4568, metadata endpoint mock: 1605, proxy: N.A. (no proxy tests) |
| metrics-util         | N.A. (no integration tests, only unit tests) |
| serverless           | N.A. (no integration tests, only unit tests) |
| shared-metrics         | app under test: 7215, mock agent: 7211 |
| opentelemetry-exporter | app under test: 6215, mock back end: 10443 |
| opentelemetry-sampler  | app under test: 8215, mock back end: 10455 |
| azure-container-services | app under test: 4217, mock back end: 9445 |