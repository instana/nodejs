# Feature Specification: Dual-Format Span Export (Instana and OTel)

## Overview

Design and implement a feature in the Node.js tracer that enables switching between span data output formats when sending data to the backend. The system must support:

1. **Existing Instana span format** (current implementation)
2. **OpenTelemetry (OTel) span format** aligned with [OTel semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)

## Objectives

### Primary Goals

1. **Dual-Format Support**: Enable the tracer to export span data in either Instana or OTel format
2. **Efficient Conversion**: Design a performant conversion mechanism from Instana spans to OTel spans
3. **Runtime Configuration**: Allow format selection via configuration without code changes
4. **Extensibility**: Create an architecture that supports adding future formats
5. **Backward Compatibility**: Ensure existing Instana format functionality remains unchanged

### Design Requirements

#### High-Level Architecture
- Architecture for supporting dual-format export (Instana vs OTel)
- Identification of where conversion should happen in the span lifecycle
- Extensible design for future format additions
- Clear separation of concerns between format-specific logic

#### Mapping Strategy
- Key field-level mappings between Instana spans and OTel spans
- Patterns in mapping:
  - Naming conventions
  - Attributes/tags transformation
  - Trace/span ID handling
  - Timestamps and duration
  - Error handling and status codes
- Reusable mapping rules or transformation layers
- Handling of format-specific fields

#### Efficient Conversion Approach
- Minimize overhead during conversion
- Schema-driven mapping vs lookup tables vs transformation pipelines
- Graceful handling of missing/extra fields
- Memory-efficient data structures
- Performance benchmarking strategy

#### Design Specification
- Clear specification for the conversion module
- Interfaces and contracts
- Data flow diagrams
- Configuration options (runtime format switching)
- Performance considerations
- Backward compatibility guarantees
- Observability and debugging support

## Constraints

1. **Performance**: Conversion overhead must be minimal (target: <5% performance impact)
2. **Memory**: No significant memory footprint increase
3. **Compatibility**: Must not break existing Instana format users
4. **Standards Compliance**: OTel format must comply with official semantic conventions
5. **Maintainability**: Code must be clean, well-documented, and testable

## Success Criteria

1. ✅ Complete design document with architecture diagrams
2. ✅ Detailed mapping specification between Instana and OTel formats
3. ✅ Performance analysis and optimization strategy
4. ✅ Configuration interface design
5. ✅ Extensibility plan for future formats
6. ✅ Test strategy for format conversion

## Out of Scope

- Implementation code (focus on design initially)
- Backend changes to support OTel format
- Changes to instrumentation libraries
- UI/visualization changes

## References

- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [OpenTelemetry Trace Specification](https://opentelemetry.io/docs/specs/otel/trace/)
- Current Instana span format (to be documented in research phase)

## Stakeholders

- Node.js tracer development team
- Backend team (for format support)
- Users requiring OTel compatibility
- Performance engineering team
