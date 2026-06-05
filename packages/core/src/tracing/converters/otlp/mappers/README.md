# OTLP Mappers - Version-Specific Loading

This directory contains version-specific OTLP (OpenTelemetry Protocol) semantic convention mappers for converting Instana spans to OTLP format.

## Current Structure

```
mappers/
├── README.md                    # This file
├── index.js                     # Main entry point (loads version-specific mappers)
├── version-loader.js            # Version loading utility
├── test-version-loader.js       # Test script
├── v1.23/                       # Version 1.23 mappers (current default)
│   ├── lookup.js                # OTLP attribute name lookup tables
│   ├── metadata-mapper.js       # Metadata field mappings
│   └── span-data-mapper.js      # Span data field mappings
└── [future versions]/           # Additional versions can be added here
```

## Usage

### Basic Usage

```javascript
const { OTLP, METADATA_MAPPINGS, MAPPINGS } = require('./mappers');

// OTLP contains lookup tables for attribute names
console.log(OTLP.http.REQUEST_METHOD); // 'http.request.method'

// METADATA_MAPPINGS contains mappings for span metadata
console.log(METADATA_MAPPINGS.t); // { otlp: 'traceId', transform: convertTraceId }

// MAPPINGS contains mappings for span data by span type
console.log(MAPPINGS.http); // Array of mapping rules for HTTP spans
```

### Switching Versions

The version can be controlled via the `OTLP_SEMCONV_VERSION` environment variable:

```bash
# Use default version (v1.23)
node your-app.js

# Use a different version
OTLP_SEMCONV_VERSION=v1.24 node your-app.js
```

## Adding a New Version

To add support for a new OTLP semantic convention version:

### 1. Create Version Directory

```bash
mkdir packages/core/src/tracing/converters/otlp/mappers/v1.24
```

### 2. Create Required Files

Copy and modify the files from the previous version:

```bash
cd packages/core/src/tracing/converters/otlp/mappers
cp v1.23/lookup.js v1.24/lookup.js
cp v1.23/metadata-mapper.js v1.24/metadata-mapper.js
cp v1.23/span-data-mapper.js v1.24/span-data-mapper.js
```

### 3. Update Mappings

Edit the new version files to reflect the changes in the OTLP semantic conventions:

- **lookup.js**: Update OTLP attribute names if they changed
- **metadata-mapper.js**: Update metadata field mappings
- **span-data-mapper.js**: Update span data mappings for different span types

### 4. Test the New Version

```bash
OTLP_SEMCONV_VERSION=v1.24 node test-version-loader.js
```

### 5. Update Default Version (Optional)

If you want to make the new version the default, update `DEFAULT_VERSION` in `version-loader.js`:

```javascript
const DEFAULT_VERSION = 'v1.24';
```

## Version Loader API

The `version-loader.js` module provides the following functions:

### `loadMappers([version])`

Loads version-specific mappers. Returns an object with:
- `OTLP`: Lookup tables for OTLP attribute names
- `METADATA_MAPPINGS`: Metadata field mappings
- `MAPPINGS`: Span data mappings
- `version`: The loaded version string

```javascript
const { loadMappers } = require('./version-loader');
const mappers = loadMappers('v1.23');
```

### `getCurrentVersion()`

Returns the currently active version string.

```javascript
const { getCurrentVersion } = require('./version-loader');
console.log(getCurrentVersion()); // 'v1.23'
```

### `clearCache()`

Clears the version cache (useful for testing).

```javascript
const { clearCache } = require('./version-loader');
clearCache();
```

## File Descriptions

### lookup.js

Contains OTLP attribute name lookup tables organized by category:
- `metadata`: Span metadata fields (traceId, spanId, etc.)
- `http`: HTTP-related attributes
- `messaging`: Messaging system attributes
- `database`: Database operation attributes
- `rpc`: RPC/gRPC attributes
- `graphql`: GraphQL attributes
- `cloud`: Cloud provider attributes
- `faas`: Function-as-a-Service attributes
- `network`: Network attributes

### metadata-mapper.js

Maps Instana span metadata fields to OTLP format:
- Trace ID, Span ID, Parent ID conversions
- Span kind mapping
- Timestamp and duration conversions
- Span name and status generation

### span-data-mapper.js

Maps Instana span data fields to OTLP attributes for different span types:
- HTTP spans
- Database spans (PostgreSQL, MySQL, MongoDB, etc.)
- Messaging spans (Kafka, RabbitMQ, SQS, etc.)
- RPC/gRPC spans
- Cloud service spans (S3, GCS, etc.)
- And more...

## Version History

- **v1.23** (Current Default): Initial version-specific implementation based on OTLP semantic conventions v1.23

## Notes

- The version loader caches loaded versions to avoid repeated file reads
- All versions must have the same file structure (lookup.js, metadata-mapper.js, span-data-mapper.js)
- The default version is v1.23 if no environment variable is set
- TypeScript errors in the version-loader are expected and don't affect runtime functionality