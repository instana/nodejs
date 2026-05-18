
## Usage

### Command Line Interface

```bash
cd scripts/

# Convert a single span
1. node instana-to-otel-converter.js examples/instana-http-span.json

# Convert and save to file
2. node instana-to-otel-converter.js examples/instana-http-span.json output.json

# Convert batch of spans
3. node instana-to-otel-converter.js examples/instana-batch-spans.json otel-batch.json

# Pipe output
4. node instana-to-otel-converter.js examples/instana-kafka-span.json > kafka-otel.json
```

