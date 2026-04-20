# Quickstart Guide: Dual-Format Span Export

**Feature**: 001-dual-format-span-export  
**Date**: 2026-04-20  
**Audience**: Developers integrating the dual-format span export feature

## Overview

This guide provides quick-start instructions for using the dual-format span export feature in the Instana Node.js tracer. You'll learn how to:

- Configure span format selection
- Switch between Instana and OpenTelemetry formats
- Customize conversion behavior
- Monitor conversion performance

---

## Prerequisites

- Node.js >= 18.19.0
- `@instana/core` >= 3.0.0
- Basic understanding of distributed tracing concepts

---

## Quick Start

### 1. Basic Configuration

#### Using Instana Format (Default)

No configuration needed - Instana format is the default:

```javascript
const instana = require('@instana/core');

instana({
  // Instana format is used by default
  tracing: {
    enabled: true
  }
});
```

#### Switching to OpenTelemetry Format

Enable OTel format via configuration:

```javascript
const instana = require('@instana/core');

instana({
  tracing: {
    enabled: true,
    spanFormat: 'opentelemetry'  // Switch to OTel format
  }
});
```

#### Using Environment Variables

```bash
# Set span format via environment variable
export INSTANA_SPAN_FORMAT=opentelemetry

# Start your application
node app.js
```

---

## Configuration Options

### Basic OpenTelemetry Configuration

```javascript
const instana = require('@instana/core');

instana({
  tracing: {
    enabled: true,
    spanFormat: 'opentelemetry',
    
    opentelemetry: {
      // Semantic conventions version
      semconvVersion: '1.24.0',
      
      // Resource attributes (service information)
      resource: {
        'service.name': 'my-service',
        'service.version': '1.0.0',
        'service.namespace': 'production'
      },
      
      // Preserve Instana-specific fields
      preserveInstanaFields: true,
      
      // Span name strategy
      spanNameStrategy: 'semantic'  // or 'technical'
    }
  }
});
```

### Advanced Configuration

```javascript
const instana = require('@instana/core');

instana({
  tracing: {
    enabled: true,
    spanFormat: 'opentelemetry',
    
    opentelemetry: {
      semconvVersion: '1.24.0',
      
      resource: {
        'service.name': 'my-service',
        'service.version': '1.0.0',
        'deployment.environment': 'production'
      },
      
      instrumentationScope: {
        name: '@instana/core',
        version: '3.0.0'
      },
      
      // Attribute limits
      attributeLimits: {
        maxAttributeCount: 128,
        maxAttributeValueLength: 4096,
        onLimitExceeded: 'truncate'  // or 'drop', 'error'
      },
      
      // Custom transformers (advanced)
      customTransformers: {
        'http': './custom-http-transformer'
      }
    },
    
    // Performance optimization
    performance: {
      lazyConversion: true,
      enableObjectPooling: true,
      objectPoolSize: 100
    },
    
    // Validation
    validation: {
      validateAfterConversion: true,
      onValidationFailure: 'warn'  // or 'error', 'skip'
    },
    
    // Observability
    observability: {
      enableMetrics: true,
      enableDebugLogging: false,
      logLevel: 'info'
    }
  }
});
```

---

## Common Use Cases

### Use Case 1: Gradual Migration to OTel

**Scenario**: You want to test OTel format in a staging environment before production.

```javascript
// config/staging.js
module.exports = {
  tracing: {
    spanFormat: 'opentelemetry',
    opentelemetry: {
      resource: {
        'service.name': 'my-service',
        'service.namespace': 'staging'
      }
    }
  }
};

// config/production.js
module.exports = {
  tracing: {
    spanFormat: 'instana',  // Keep Instana format in production
  }
};

// app.js
const config = require(`./config/${process.env.NODE_ENV}`);
const instana = require('@instana/core');

instana(config);
```

### Use Case 2: Runtime Format Switching

**Scenario**: Switch format based on a feature flag or configuration change.

```javascript
const instana = require('@instana/core');

// Initial configuration
const config = {
  tracing: {
    enabled: true,
    spanFormat: 'instana'
  }
};

instana(config);

// Later, switch format (requires configuration hot-reload support)
// Note: This is a planned feature - check documentation for availability
function switchToOTelFormat() {
  config.tracing.spanFormat = 'opentelemetry';
  config.tracing.opentelemetry = {
    resource: {
      'service.name': 'my-service'
    }
  };
  
  // Configuration will be picked up on next span export
  console.log('Switched to OpenTelemetry format');
}
```

### Use Case 3: Custom Resource Attributes

**Scenario**: Add custom resource attributes for better service identification.

```javascript
const instana = require('@instana/core');
const os = require('os');

instana({
  tracing: {
    spanFormat: 'opentelemetry',
    opentelemetry: {
      resource: {
        'service.name': process.env.SERVICE_NAME || 'my-service',
        'service.version': process.env.SERVICE_VERSION || '1.0.0',
        'service.namespace': process.env.ENVIRONMENT || 'development',
        'service.instance.id': process.env.HOSTNAME || os.hostname(),
        'deployment.environment': process.env.ENVIRONMENT,
        'cloud.provider': process.env.CLOUD_PROVIDER,
        'cloud.region': process.env.CLOUD_REGION
      }
    }
  }
});
```

### Use Case 4: Performance-Optimized Configuration

**Scenario**: Optimize for high-throughput applications.

```javascript
const instana = require('@instana/core');

instana({
  tracing: {
    spanFormat: 'opentelemetry',
    
    opentelemetry: {
      resource: {
        'service.name': 'high-throughput-service'
      },
      
      // Minimal attribute limits for performance
      attributeLimits: {
        maxAttributeCount: 64,
        maxAttributeValueLength: 1024,
        onLimitExceeded: 'drop'  // Drop instead of truncate
      }
    },
    
    performance: {
      lazyConversion: true,           // Convert only when needed
      enableObjectPooling: true,      // Reuse objects
      objectPoolSize: 200,            // Larger pool for high throughput
      enableSpanNameMemoization: true, // Cache span names
      memoizationCacheSize: 2000
    },
    
    validation: {
      validateAfterConversion: false,  // Skip validation for performance
      onValidationFailure: 'skip'
    }
  }
});
```

### Use Case 5: Debug Mode

**Scenario**: Enable detailed logging for troubleshooting conversion issues.

```javascript
const instana = require('@instana/core');

instana({
  tracing: {
    spanFormat: 'opentelemetry',
    
    opentelemetry: {
      resource: {
        'service.name': 'my-service'
      }
    },
    
    validation: {
      validateBeforeConversion: true,
      validateAfterConversion: true,
      onValidationFailure: 'error',  // Fail fast on validation errors
      strictMode: true
    },
    
    observability: {
      enableMetrics: true,
      enableDebugLogging: true,      // Enable debug logs
      logLevel: 'debug',
      enablePerformanceTracking: true,
      performanceTrackingSampleRate: 1.0  // Track all conversions
    }
  }
});
```

---

## Monitoring Conversion Performance

### Accessing Conversion Metrics

```javascript
const instana = require('@instana/core');

// Get converter statistics
const stats = instana.getConverterStats();

console.log('Conversion Statistics:', {
  total: stats.conversionsTotal,
  success: stats.conversionsSuccess,
  failed: stats.conversionsFailed,
  avgTimeUs: stats.avgConversionTimeUs,
  peakTimeUs: stats.peakConversionTimeUs,
  fieldsDropped: stats.totalFieldsDropped
});
```

### Performance Benchmarking

```javascript
const instana = require('@instana/core');

// Enable performance tracking
instana({
  tracing: {
    spanFormat: 'opentelemetry',
    observability: {
      enablePerformanceTracking: true,
      performanceTrackingSampleRate: 0.1  // Sample 10% of conversions
    }
  }
});

// Performance metrics will be logged periodically
// Check logs for conversion performance data
```

---

## Troubleshooting

### Issue: Spans Not Converting

**Symptoms**: Spans are still in Instana format despite configuration.

**Solution**:
1. Verify configuration is loaded correctly
2. Check for configuration syntax errors
3. Ensure `spanFormat` is set to `'opentelemetry'`
4. Check logs for validation errors

```javascript
// Add debug logging
instana({
  tracing: {
    spanFormat: 'opentelemetry',
    observability: {
      enableDebugLogging: true,
      logLevel: 'debug'
    }
  }
});
```

### Issue: Validation Errors

**Symptoms**: Logs show validation errors during conversion.

**Solution**:
1. Check attribute limits configuration
2. Verify span data is valid
3. Enable strict mode to catch issues early

```javascript
instana({
  tracing: {
    spanFormat: 'opentelemetry',
    validation: {
      strictMode: true,
      onValidationFailure: 'error'  // Fail fast
    }
  }
});
```

### Issue: Performance Degradation

**Symptoms**: Application performance drops after enabling OTel format.

**Solution**:
1. Enable lazy conversion
2. Increase object pool size
3. Reduce attribute limits
4. Disable validation in production

```javascript
instana({
  tracing: {
    spanFormat: 'opentelemetry',
    performance: {
      lazyConversion: true,
      enableObjectPooling: true,
      objectPoolSize: 200
    },
    validation: {
      validateAfterConversion: false  // Disable in production
    }
  }
});
```

### Issue: Missing Attributes

**Symptoms**: Some span attributes are missing in OTel format.

**Solution**:
1. Check attribute limits
2. Verify custom transformers (if used)
3. Enable `preserveInstanaFields` to keep Instana-specific data

```javascript
instana({
  tracing: {
    spanFormat: 'opentelemetry',
    opentelemetry: {
      preserveInstanaFields: true,  // Keep Instana fields
      attributeLimits: {
        maxAttributeCount: 256,  // Increase limit
        onLimitExceeded: 'truncate'
      }
    }
  }
});
```

---

## Best Practices

### 1. Start with Default Configuration

Begin with minimal configuration and add options as needed:

```javascript
instana({
  tracing: {
    spanFormat: 'opentelemetry',
    opentelemetry: {
      resource: {
        'service.name': 'my-service'
      }
    }
  }
});
```

### 2. Use Environment-Specific Configuration

Separate configuration by environment:

```javascript
const config = {
  development: {
    spanFormat: 'opentelemetry',
    observability: { enableDebugLogging: true }
  },
  production: {
    spanFormat: 'opentelemetry',
    performance: { lazyConversion: true },
    validation: { validateAfterConversion: false }
  }
};

instana({
  tracing: config[process.env.NODE_ENV]
});
```

### 3. Monitor Conversion Performance

Always enable metrics in production:

```javascript
instana({
  tracing: {
    spanFormat: 'opentelemetry',
    observability: {
      enableMetrics: true,
      enablePerformanceTracking: true,
      performanceTrackingSampleRate: 0.1
    }
  }
});
```

### 4. Test Before Production

Test OTel format in staging before production:

1. Enable OTel format in staging
2. Monitor for validation errors
3. Check performance metrics
4. Verify span data correctness
5. Roll out to production gradually

### 5. Use Semantic Span Names

Prefer semantic span names for better observability:

```javascript
instana({
  tracing: {
    spanFormat: 'opentelemetry',
    opentelemetry: {
      spanNameStrategy: 'semantic'  // e.g., 'GET /api/users'
    }
  }
});
```

---

## Migration Checklist

- [ ] Review current Instana configuration
- [ ] Add OTel configuration with resource attributes
- [ ] Test in development environment
- [ ] Enable debug logging and monitor for errors
- [ ] Test in staging environment
- [ ] Monitor conversion performance metrics
- [ ] Verify span data correctness
- [ ] Gradually roll out to production
- [ ] Monitor production metrics
- [ ] Document any custom configuration

---

## Next Steps

- **Phase 2**: Review [Implementation Plan](./plan.md) for detailed architecture
- **Phase 3**: Explore [Data Model](./data-model.md) for field mappings
- **Phase 4**: Check [Contracts](./contracts/) for API specifications
- **Phase 5**: Read [Research](./research.md) for design decisions

---

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review logs with debug logging enabled
- Consult the [Data Model](./data-model.md) for mapping details
- Contact the Instana Node.js team

---

**Version**: 1.0.0  
**Last Updated**: 2026-04-20
