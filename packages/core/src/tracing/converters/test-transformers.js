/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

/**
 * Test script to demonstrate the transformer pattern
 */

const { getTransformer } = require('./transformers');

// ============================================================================
// Test Data
// ============================================================================

const httpSpan = {
  t: '1234567890abcdef',
  s: 'abcdef123456',
  p: '9876543210fe',
  n: 'http',
  k: 2,
  ts: 1234567890000,
  d: 100,
  ec: 0,
  data: {
    http: {
      method: 'get',
      status: 200,
      url: 'https://example.com/api/users',
      path: '/api/users',
      host: 'example.com'
    }
  }
};

const kafkaSpan = {
  t: '1234567890abcdef',
  s: 'fedcba098765',
  p: 'abcdef123456',
  n: 'kafka',
  k: 3,
  ts: 1234567890000,
  d: 50,
  ec: 0,
  data: {
    kafka: {
      service: 'user-events',
      access: 'send',
      topic: 'user-events',
      partition: 0,
      offset: 12345,
      key: 'user-123'
    }
  }
};

const rabbitmqSpan = {
  t: '1234567890abcdef',
  s: '123456fedcba',
  p: 'abcdef123456',
  n: 'rabbitmq',
  k: 3,
  ts: 1234567890000,
  d: 30,
  ec: 0,
  data: {
    rabbitmq: {
      service: 'notifications',
      access: 'publish',
      queue: 'notification-queue',
      exchange: 'notifications',
      routingKey: 'email.send'
    }
  }
};

// ============================================================================
// Test Functions
// ============================================================================

function testTransformer(span, spanType) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${spanType.toUpperCase()} Transformer`);
  console.log('='.repeat(60));

  const transformer = getTransformer(span);

  console.log('\nTransformer Type:', transformer.constructor.name);

  // Test meta() - should be empty for now (metadata handled separately)
  const meta = transformer.meta();
  console.log('\nMeta Mappings:', JSON.stringify(meta, null, 2));

  // Test data() - should return the data mappings configuration
  const data = transformer.data();
  console.log('\nData Mappings Configuration:');
  console.log('  Prefix:', data.prefix);
  console.log('  Additional Attributes:', JSON.stringify(data.additionalAttributes, null, 2));
  console.log('  Field Mappings:', Object.keys(data.mappings).length, 'fields');
  console.log('  Sample Mappings:');
  Object.entries(data.mappings)
    .slice(0, 3)
    .forEach(([key, mapping]) => {
      console.log(`    ${key} -> ${mapping.key}${mapping.value ? ' (with transformer)' : ''}`);
    });

  // Test getSpanName()
  const spanName = transformer.getSpanName();
  console.log('\nGenerated Span Name:', spanName);
}

function demonstrateInheritance() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Demonstrating Inheritance Pattern');
  console.log('='.repeat(60));

  const kafkaTransformer = getTransformer(kafkaSpan);
  const rabbitmqTransformer = getTransformer(rabbitmqSpan);

  console.log('\nKafka Transformer:');
  console.log('  Class:', kafkaTransformer.constructor.name);
  console.log('  Parent:', Object.getPrototypeOf(kafkaTransformer.constructor).name);
  console.log(
    '  Inherits from MessagingTransformer:',
    kafkaTransformer instanceof require('./transformers').MessagingTransformer
  );

  console.log('\nRabbitMQ Transformer:');
  console.log('  Class:', rabbitmqTransformer.constructor.name);
  console.log('  Parent:', Object.getPrototypeOf(rabbitmqTransformer.constructor).name);
  console.log(
    '  Inherits from MessagingTransformer:',
    rabbitmqTransformer instanceof require('./transformers').MessagingTransformer
  );

  console.log('\nShared Messaging Fields:');
  const kafkaData = kafkaTransformer.data();
  const rabbitmqData = rabbitmqTransformer.data();

  const sharedFields = Object.keys(kafkaData.mappings).filter(
    key => rabbitmqData.mappings[key] && kafkaData.mappings[key].key === rabbitmqData.mappings[key].key
  );

  console.log('  Common fields inherited from MessagingTransformer:');
  sharedFields.forEach(field => {
    console.log(`    - ${field} -> ${kafkaData.mappings[field].key}`);
  });

  console.log('\nKafka-Specific Fields:');
  const kafkaSpecific = Object.keys(kafkaData.mappings).filter(key => !sharedFields.includes(key));
  kafkaSpecific.forEach(field => {
    console.log(`    - ${field} -> ${kafkaData.mappings[field].key}`);
  });

  console.log('\nRabbitMQ-Specific Fields:');
  const rabbitmqSpecific = Object.keys(rabbitmqData.mappings).filter(key => !sharedFields.includes(key));
  rabbitmqSpecific.forEach(field => {
    console.log(`    - ${field} -> ${rabbitmqData.mappings[field].key}`);
  });
}

// ============================================================================
// Run Tests
// ============================================================================

function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Transformer Pattern Test Suite');
  console.log('='.repeat(60));

  testTransformer(httpSpan, 'HTTP');
  testTransformer(kafkaSpan, 'Kafka');
  testTransformer(rabbitmqSpan, 'RabbitMQ');
  demonstrateInheritance();

  console.log(`\n${'='.repeat(60)}`);
  console.log('All Tests Complete!');
  console.log(`${'='.repeat(60)}\n`);
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };

// Made with Bob
