# Tasks: Dual-Format Span Export (Instana and OTel)

**Input**: Design documents from `/specs/001-dual-format-span-export/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are NOT explicitly requested in the specification, so test tasks are excluded.

**Organization**: Tasks are organized by functional area to enable efficient implementation of the dual-format span export feature.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions

This is a library feature within the existing `@instana/core` package:
- Core implementation: `packages/core/src/tracing/`
- Configuration: `packages/core/src/config/`
- Type definitions: `packages/core/src/core.d.ts`

---

## Phase 1: Setup (Project Structure)

**Purpose**: Establish directory structure and configuration for the new feature

- [X] T001 Create converter module directory at packages/core/src/tracing/converters/
- [X] T002 [P] Create configuration schema file at packages/core/src/config/spanFormatConfig.js
- [X] T003 [P] Create type definitions file at packages/core/src/tracing/converters/types.js

---

## Phase 2: Foundational (Core Interfaces & Registry)

**Purpose**: Core infrastructure that MUST be complete before converter implementation

**⚠️ CRITICAL**: No converter work can begin until this phase is complete

- [X] T004 Implement SpanConverter interface in packages/core/src/tracing/converters/SpanConverter.js
- [X] T005 Implement ConversionResult and ValidationResult types (already in types.js)
- [X] T006 Implement SpanConverterRegistry in packages/core/src/tracing/converters/SpanConverterRegistry.js
- [X] T007 [P] Implement ConversionError class in packages/core/src/tracing/converters/ConversionError.js
- [X] T008 [P] Create converter statistics tracking in packages/core/src/tracing/converters/ConverterStats.js
- [X] T009 Update core configuration to support spanFormat option in packages/core/src/config/index.js

**Checkpoint**: Foundation ready - converter implementation can now begin

---

## Phase 3: OpenTelemetry Span Schema

**Goal**: Define complete OpenTelemetry span structure and validation

**Independent Test**: Validate OTel span schema against OpenTelemetry specification v1.24.0

- [ ] T010 [P] Define OTelSpan interface in packages/core/src/tracing/converters/otel/OTelSpan.js
- [ ] T011 [P] Define SpanKind and StatusCode enums in packages/core/src/tracing/converters/otel/OTelEnums.js
- [ ] T012 [P] Define semantic attribute constants in packages/core/src/tracing/converters/otel/SemanticAttributes.js
- [ ] T013 Implement OTel span validation in packages/core/src/tracing/converters/otel/OTelValidator.js
- [ ] T014 [P] Define validation constraints in packages/core/src/tracing/converters/otel/ValidationConstraints.js

**Checkpoint**: OTel schema complete and validated

---

## Phase 4: Core Field Mapping

**Goal**: Implement direct field-to-field mappings between Instana and OTel formats

**Independent Test**: Convert basic Instana span with only core fields to OTel format

- [ ] T015 Implement span kind mapper in packages/core/src/tracing/converters/otel/mappers/SpanKindMapper.js
- [ ] T016 [P] Implement timestamp converter (ms to ns) in packages/core/src/tracing/converters/otel/mappers/TimestampMapper.js
- [ ] T017 [P] Implement trace context mapper (traceFlags, traceState) in packages/core/src/tracing/converters/otel/mappers/TraceContextMapper.js
- [ ] T018 Implement status code mapper (error count to status) in packages/core/src/tracing/converters/otel/mappers/StatusMapper.js
- [ ] T019 Implement core field mapper orchestrator in packages/core/src/tracing/converters/otel/mappers/CoreFieldMapper.js

**Checkpoint**: Core fields convert correctly

---

## Phase 5: Span Name Transformation

**Goal**: Transform Instana technical span names to OTel semantic operation names

**Independent Test**: Generate correct OTel span names for all supported protocols

- [ ] T020 Create span name mapping rules registry in packages/core/src/tracing/converters/otel/mappers/SpanNameRules.js
- [ ] T021 [P] Implement HTTP span name mapper in packages/core/src/tracing/converters/otel/mappers/names/HttpSpanNameMapper.js
- [ ] T022 [P] Implement database span name mapper in packages/core/src/tracing/converters/otel/mappers/names/DatabaseSpanNameMapper.js
- [ ] T023 [P] Implement messaging span name mapper in packages/core/src/tracing/converters/otel/mappers/names/MessagingSpanNameMapper.js
- [ ] T024 [P] Implement RPC span name mapper in packages/core/src/tracing/converters/otel/mappers/names/RpcSpanNameMapper.js
- [ ] T025 Implement span name mapper orchestrator with memoization in packages/core/src/tracing/converters/otel/mappers/SpanNameMapper.js

**Checkpoint**: Span names generate correctly for all protocols

---

## Phase 6: Attribute Transformation (HTTP)

**Goal**: Transform HTTP-specific data to OTel semantic attributes

**Independent Test**: Convert HTTP spans with all field variations

- [ ] T026 Define HTTP attribute mapping schema in packages/core/src/tracing/converters/otel/mappers/attributes/HttpAttributeMap.js
- [ ] T027 Implement HTTP attribute transformer in packages/core/src/tracing/converters/otel/mappers/attributes/HttpAttributeTransformer.js
- [ ] T028 [P] Handle HTTP method, URL, status code mappings in packages/core/src/tracing/converters/otel/mappers/attributes/HttpAttributeTransformer.js
- [ ] T029 [P] Handle HTTP headers and route template mappings in packages/core/src/tracing/converters/otel/mappers/attributes/HttpAttributeTransformer.js

**Checkpoint**: HTTP spans convert with correct attributes

---

## Phase 7: Attribute Transformation (Database)

**Goal**: Transform database-specific data to OTel semantic attributes

**Independent Test**: Convert database spans for Redis, MongoDB, PostgreSQL, MySQL, DynamoDB

- [ ] T030 Define database attribute mapping schema in packages/core/src/tracing/converters/otel/mappers/attributes/DatabaseAttributeMap.js
- [ ] T031 [P] Implement Redis attribute transformer in packages/core/src/tracing/converters/otel/mappers/attributes/RedisAttributeTransformer.js
- [ ] T032 [P] Implement MongoDB attribute transformer in packages/core/src/tracing/converters/otel/mappers/attributes/MongoAttributeTransformer.js
- [ ] T033 [P] Implement SQL database attribute transformer in packages/core/src/tracing/converters/otel/mappers/attributes/SqlAttributeTransformer.js
- [ ] T034 [P] Implement DynamoDB attribute transformer in packages/core/src/tracing/converters/otel/mappers/attributes/DynamoDbAttributeTransformer.js
- [ ] T035 Implement database attribute transformer orchestrator in packages/core/src/tracing/converters/otel/mappers/attributes/DatabaseAttributeTransformer.js

**Checkpoint**: Database spans convert with correct attributes

---

## Phase 8: Attribute Transformation (Messaging)

**Goal**: Transform messaging-specific data to OTel semantic attributes

**Independent Test**: Convert messaging spans for Kafka, RabbitMQ, SQS

- [ ] T036 Define messaging attribute mapping schema in packages/core/src/tracing/converters/otel/mappers/attributes/MessagingAttributeMap.js
- [ ] T037 [P] Implement Kafka attribute transformer in packages/core/src/tracing/converters/otel/mappers/attributes/KafkaAttributeTransformer.js
- [ ] T038 [P] Implement RabbitMQ attribute transformer in packages/core/src/tracing/converters/otel/mappers/attributes/RabbitMqAttributeTransformer.js
- [ ] T039 [P] Implement SQS attribute transformer in packages/core/src/tracing/converters/otel/mappers/attributes/SqsAttributeTransformer.js
- [ ] T040 Implement messaging attribute transformer orchestrator in packages/core/src/tracing/converters/otel/mappers/attributes/MessagingAttributeTransformer.js

**Checkpoint**: Messaging spans convert with correct attributes

---

## Phase 9: Generic Attribute Flattening

**Goal**: Handle unknown protocols and custom attributes

**Independent Test**: Convert spans with custom/unknown protocol data

- [ ] T041 Implement generic attribute flattener in packages/core/src/tracing/converters/otel/mappers/attributes/GenericAttributeFlattener.js
- [ ] T042 Implement attribute value type validator in packages/core/src/tracing/converters/otel/mappers/attributes/AttributeValueValidator.js
- [ ] T043 Implement attribute limits enforcer in packages/core/src/tracing/converters/otel/mappers/attributes/AttributeLimitsEnforcer.js
- [ ] T044 Implement attribute transformer registry in packages/core/src/tracing/converters/otel/mappers/attributes/AttributeTransformerRegistry.js

**Checkpoint**: All attribute types convert correctly

---

## Phase 10: Resource Extraction

**Goal**: Extract service and host information to OTel Resource

**Independent Test**: Resource attributes populated correctly from Instana span metadata

- [ ] T045 Implement resource attribute extractor in packages/core/src/tracing/converters/otel/mappers/ResourceMapper.js
- [ ] T046 [P] Extract service instance ID from span.f.e in packages/core/src/tracing/converters/otel/mappers/ResourceMapper.js
- [ ] T047 [P] Extract host name from span.f.h in packages/core/src/tracing/converters/otel/mappers/ResourceMapper.js
- [ ] T048 [P] Extract container ID from span.f.cp in packages/core/src/tracing/converters/otel/mappers/ResourceMapper.js
- [ ] T049 Merge with user-configured resource attributes in packages/core/src/tracing/converters/otel/mappers/ResourceMapper.js

**Checkpoint**: Resource attributes complete

---

## Phase 11: Instana Field Preservation

**Goal**: Preserve Instana-specific fields under instana.* namespace

**Independent Test**: Instana-specific fields preserved when preserveInstanaFields=true

- [ ] T050 Implement Instana field preserver in packages/core/src/tracing/converters/otel/mappers/InstanaFieldPreserver.js
- [ ] T051 [P] Preserve synthetic marker (sy) as instana.synthetic in packages/core/src/tracing/converters/otel/mappers/InstanaFieldPreserver.js
- [ ] T052 [P] Preserve batch info (b) as instana.batch.* in packages/core/src/tracing/converters/otel/mappers/InstanaFieldPreserver.js
- [ ] T053 [P] Preserve correlation info (crtp, crid) as instana.correlation.* in packages/core/src/tracing/converters/otel/mappers/InstanaFieldPreserver.js
- [ ] T054 [P] Preserve W3C trace context (tp, lt) in traceState in packages/core/src/tracing/converters/otel/mappers/InstanaFieldPreserver.js

**Checkpoint**: Instana fields preserved correctly

---

## Phase 12: OTel Converter Implementation

**Goal**: Assemble all mappers into complete OTel converter

**Independent Test**: Full Instana-to-OTel conversion for all span types

- [ ] T055 Implement OTelFormatConverter class in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T056 Implement three-stage conversion pipeline (core, attributes, resource) in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T057 Integrate all mappers into conversion pipeline in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T058 Implement conversion error handling and fallback in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T059 Implement conversion statistics tracking in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T060 Add instrumentation scope metadata in packages/core/src/tracing/converters/otel/OTelFormatConverter.js

**Checkpoint**: Complete OTel converter functional

---

## Phase 13: Performance Optimizations

**Goal**: Optimize conversion performance to meet <5% overhead target

**Independent Test**: Benchmark conversion performance at 10k spans/sec

- [ ] T061 Implement object pool for OTel spans in packages/core/src/tracing/converters/otel/OTelSpanPool.js
- [ ] T062 [P] Implement span name memoization cache in packages/core/src/tracing/converters/otel/SpanNameCache.js
- [ ] T063 [P] Implement lazy attribute conversion in packages/core/src/tracing/converters/otel/LazyAttributeConverter.js
- [ ] T064 Optimize timestamp conversion (avoid repeated multiplication) in packages/core/src/tracing/converters/otel/mappers/TimestampMapper.js
- [ ] T065 Add performance tracking and metrics in packages/core/src/tracing/converters/otel/PerformanceTracker.js

**Checkpoint**: Performance target achieved (<5μs per span)

---

## Phase 14: Configuration Integration

**Goal**: Integrate span format configuration into core tracer

**Independent Test**: Configuration changes affect span export format

- [ ] T066 Extend core config schema with spanFormat options in packages/core/src/config/normalizeConfig.js
- [ ] T067 [P] Add environment variable support (INSTANA_SPAN_FORMAT) in packages/core/src/config/normalizeConfig.js
- [ ] T068 Implement configuration validation for span format options in packages/core/src/config/configValidators/spanFormatValidation.js
- [ ] T069 Add default configuration values in packages/core/src/config/index.js
- [ ] T070 Implement configuration hot-reload support in packages/core/src/config/index.js

**Checkpoint**: Configuration system complete

---

## Phase 15: Span Export Integration

**Goal**: Integrate converter into span transmission pipeline

**Independent Test**: Spans exported in correct format based on configuration

- [ ] T071 Modify span transmission to check format configuration in packages/core/src/tracing/index.js
- [ ] T072 Integrate converter registry into span exporter in packages/core/src/tracing/index.js
- [ ] T073 Add format selection logic before transmission in packages/core/src/tracing/index.js
- [ ] T074 Implement conversion error handling and fallback to Instana format in packages/core/src/tracing/index.js
- [ ] T075 Add conversion metrics to span transmission in packages/core/src/tracing/index.js

**Checkpoint**: Spans export in configured format

---

## Phase 16: Validation & Error Handling

**Goal**: Comprehensive validation and error recovery

**Independent Test**: Invalid spans handled gracefully with appropriate errors/warnings

- [ ] T076 Implement pre-conversion validation in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T077 [P] Implement post-conversion validation in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T078 Add validation error reporting and logging in packages/core/src/tracing/converters/otel/ValidationErrorReporter.js
- [ ] T079 Implement graceful degradation (fallback to Instana format) in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T080 Add validation metrics tracking in packages/core/src/tracing/converters/otel/ValidationMetrics.js

**Checkpoint**: Validation complete and robust

---

## Phase 17: Observability & Debugging

**Goal**: Add logging, metrics, and debugging support

**Independent Test**: Conversion operations observable via logs and metrics

- [ ] T081 [P] Add debug logging for conversion operations in packages/core/src/tracing/converters/otel/OTelFormatConverter.js
- [ ] T082 [P] Implement conversion metrics collection in packages/core/src/tracing/converters/ConverterMetrics.js
- [ ] T083 [P] Add performance tracking with sampling in packages/core/src/tracing/converters/otel/PerformanceTracker.js
- [ ] T084 Expose converter statistics via API in packages/core/src/tracing/converters/SpanConverterRegistry.js
- [ ] T085 Add validation error reporting in packages/core/src/tracing/converters/otel/ValidationErrorReporter.js

**Checkpoint**: Full observability in place

---

## Phase 18: Type Definitions & Documentation

**Goal**: Complete TypeScript definitions and inline documentation

**Independent Test**: TypeScript compilation succeeds with no errors

- [ ] T086 [P] Add TypeScript definitions for all converter interfaces in packages/core/src/core.d.ts
- [ ] T087 [P] Add JSDoc comments to all public APIs in packages/core/src/tracing/converters/
- [ ] T088 [P] Document configuration options in packages/core/src/config/index.js
- [ ] T089 [P] Add inline code examples in JSDoc comments
- [ ] T090 Update core type definitions with span format types in packages/core/src/core.d.ts

**Checkpoint**: Type definitions complete

---

## Phase 19: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements and validation

- [ ] T091 [P] Code cleanup and refactoring across converter modules
- [ ] T092 [P] Add error messages and user-friendly warnings
- [ ] T093 [P] Optimize memory usage in conversion pipeline
- [ ] T094 Validate against quickstart.md examples in specs/001-dual-format-span-export/quickstart.md
- [ ] T095 [P] Add README for converter module at packages/core/src/tracing/converters/README.md
- [ ] T096 [P] Document extension points for custom transformers
- [ ] T097 Verify backward compatibility (Instana format unchanged)
- [ ] T098 Run performance benchmarks and document results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all converter work
- **OTel Schema (Phase 3)**: Depends on Foundational - can proceed in parallel with Phase 4
- **Core Field Mapping (Phase 4)**: Depends on Foundational and Phase 3
- **Span Name (Phase 5)**: Depends on Phase 4
- **Attribute Phases (6-9)**: Depend on Phase 4, can proceed in parallel with each other
- **Resource (Phase 10)**: Depends on Phase 4, can proceed in parallel with Phases 6-9
- **Instana Fields (Phase 11)**: Depends on Phase 4, can proceed in parallel with Phases 6-10
- **OTel Converter (Phase 12)**: Depends on Phases 4-11 completion
- **Performance (Phase 13)**: Depends on Phase 12
- **Configuration (Phase 14)**: Depends on Phase 2, can proceed in parallel with Phases 3-13
- **Export Integration (Phase 15)**: Depends on Phases 12 and 14
- **Validation (Phase 16)**: Depends on Phase 12, can proceed in parallel with Phase 15
- **Observability (Phase 17)**: Depends on Phase 12, can proceed in parallel with Phases 15-16
- **Type Definitions (Phase 18)**: Can proceed in parallel with most phases
- **Polish (Phase 19)**: Depends on all previous phases

### Parallel Opportunities

- Phases 3 and 4 can start together after Phase 2
- Phases 6, 7, 8, 9, 10, 11 can all proceed in parallel after Phase 4
- Phase 14 can proceed in parallel with Phases 3-13
- Phase 18 can proceed in parallel with most implementation phases
- Within each phase, tasks marked [P] can run in parallel

---

## Implementation Strategy

### MVP First (Core Conversion Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: OTel Schema
4. Complete Phase 4: Core Field Mapping
5. Complete Phase 5: Span Name Transformation
6. Complete Phase 6: HTTP Attributes (most common)
7. Complete Phase 12: Basic OTel Converter (without all protocols)
8. Complete Phase 14: Configuration
9. Complete Phase 15: Export Integration
10. **STOP and VALIDATE**: Test HTTP span conversion end-to-end

### Full Feature Delivery

1. Complete MVP (above)
2. Add Phase 7: Database Attributes
3. Add Phase 8: Messaging Attributes
4. Add Phase 9: Generic Flattening
5. Add Phase 10: Resource Extraction
6. Add Phase 11: Instana Field Preservation
7. Update Phase 12: Complete OTel Converter
8. Add Phase 13: Performance Optimizations
9. Add Phase 16: Validation
10. Add Phase 17: Observability
11. Add Phase 18: Type Definitions
12. Complete Phase 19: Polish

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (Phases 1-2)
2. Once Foundational is done:
   - Developer A: OTel Schema + Core Mapping (Phases 3-4)
   - Developer B: Configuration (Phase 14)
   - Developer C: Type Definitions (Phase 18)
3. After Phase 4:
   - Developer A: Span Names + HTTP Attributes (Phases 5-6)
   - Developer B: Database Attributes (Phase 7)
   - Developer C: Messaging Attributes (Phase 8)
   - Developer D: Resource + Instana Fields (Phases 10-11)
4. Converge on Phase 12: OTel Converter assembly
5. Split again:
   - Developer A: Performance (Phase 13)
   - Developer B: Export Integration (Phase 15)
   - Developer C: Validation (Phase 16)
   - Developer D: Observability (Phase 17)
6. Final polish together (Phase 19)

---

## Notes

- [P] tasks = different files, no dependencies
- Each phase should be independently testable
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
- Performance target: <5μs per span conversion
- Memory target: <60% overhead per span
- Backward compatibility: Instana format must remain unchanged