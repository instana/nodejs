<!--
Sync Impact Report:
Version: 1.0.0 → 1.1.0 (Amendment: Design-Focused Phases)
Modified Principles:
  - Principle III: Test-Driven Development → Added exception for design-focused phases
Added Sections:
  - Design-Focused Phase Exception under Principle III
Removed Sections: None
Templates Requiring Updates:
  ✅ .specify/templates/plan-template.md (Constitution Check section references this file)
  ✅ .specify/templates/spec-template.md (Requirements must align with principles)
  ✅ .specify/templates/tasks-template.md (Task categorization reflects principles)
Follow-up TODOs: None
-->

# Instana Node.js Tracer Constitution

## Core Principles

### I. Backward Compatibility (NON-NEGOTIABLE)

**Zero Breaking Changes**: All changes MUST maintain backward compatibility with existing instrumentation and APIs. New features MUST be opt-in via configuration. Deprecations require a minimum of one major version notice period with clear migration paths documented.

**Rationale**: The Instana Node.js tracer is a production APM library used across thousands of applications. Breaking changes cause immediate production incidents and erode user trust. Backward compatibility ensures seamless upgrades and maintains the reliability contract with users.

### II. Performance First

**Performance Budget**: New features MUST NOT introduce more than 5% performance overhead. Memory footprint increases MUST be justified and documented. All performance-critical paths MUST be benchmarked before and after changes.

**Observability Overhead**: As an observability tool, the tracer itself MUST have minimal impact on application performance. Instrumentation overhead MUST be measured and optimized. Span processing MUST handle high-volume scenarios (10,000+ spans/second).

**Rationale**: Performance degradation in an APM tool is unacceptable as it directly impacts the applications being monitored. Users choose Instana for its low overhead; maintaining this is critical to product differentiation.

### III. Test-Driven Development

**TDD for Implementation**: Tests MUST be written before implementation code. The Red-Green-Refactor cycle is strictly enforced for all implementation phases:
1. Write failing tests that define expected behavior
2. Implement minimal code to pass tests
3. Refactor while keeping tests green

**Test Coverage**: All new code MUST have comprehensive test coverage:
- Unit tests for individual functions and classes
- Integration tests for instrumentation and tracing flows
- Contract tests for external interfaces (OpenTelemetry, backend APIs)
- Performance tests for critical paths

**Design-Focused Phase Exception**: Design and research phases (spec.md, plan.md, research.md, data-model.md, contracts/) MAY proceed without test tasks when the phase objective is architectural design, API specification, or technical research. However:
- Design artifacts MUST include testability requirements
- Implementation phases MUST follow strict TDD
- Test strategy MUST be documented in the design
- Contracts MUST define testable interfaces

**Rationale**: The tracer operates in diverse runtime environments with hundreds of instrumented libraries. TDD ensures correctness, prevents regressions, and provides living documentation of expected behavior. Design-focused phases establish the foundation for testable implementation.

### IV. Monorepo Architecture

**Package Independence**: Each package in the monorepo MUST be independently publishable and versioned. Packages MUST declare explicit dependencies. Circular dependencies are prohibited.

**Shared Infrastructure**: Common functionality MUST be extracted to shared packages (`@instana/core`, `@instana/shared-metrics`, `@instana/metrics-util`). Code duplication across packages is a code smell requiring refactoring.

**Lerna Management**: Use Lerna for monorepo operations (versioning, publishing, dependency management). All packages MUST follow the same release cadence unless explicitly justified.

**Rationale**: The monorepo structure enables code sharing while maintaining package boundaries. This supports multiple deployment targets (traditional servers, AWS Lambda, Fargate, Cloud Run) from a single codebase.

### V. Standards Compliance

**OpenTelemetry Alignment**: When implementing OpenTelemetry support, MUST comply with official semantic conventions. Version compatibility MUST be explicitly documented. Deviations from standards MUST be justified and documented.

**Node.js Version Support**: MUST support all active Node.js LTS versions (currently >= 18.19.0). New Node.js versions MUST be tested in prerelease pipelines before official release.

**Semantic Versioning**: MUST follow semantic versioning strictly:
- MAJOR: Breaking changes (API removals, behavior changes)
- MINOR: New features, new instrumentation support
- PATCH: Bug fixes, performance improvements, documentation

**Rationale**: Standards compliance ensures interoperability and reduces user friction. Semantic versioning provides clear upgrade expectations and enables automated dependency management.

### VI. Instrumentation Quality

**Zero-Config Instrumentation**: Instrumentation MUST work automatically without requiring code changes. Manual instrumentation APIs are supplementary, not primary.

**Defensive Programming**: Instrumentation MUST NOT crash user applications. All instrumentation code MUST handle errors gracefully. Failed instrumentation MUST log warnings but allow application execution to continue.

**Minimal Dependencies**: Instrumentation packages MUST minimize production dependencies. Use `^` version ranges for dependencies unless specific pinning is justified (monkey-patching, unstable APIs).

**Rationale**: Automatic instrumentation is Instana's core value proposition. Defensive programming ensures the tracer never becomes the source of production issues.

### VII. Documentation and Maintainability

**Code Documentation**: All public APIs MUST have JSDoc comments. Complex algorithms MUST have inline comments explaining the "why" not just the "what". Configuration options MUST be documented with examples.

**External Documentation**: User-facing documentation lives at https://www.ibm.com/docs/en/instana-observability/current. Internal documentation (CONTRIBUTING.md, package READMEs) MUST be kept up-to-date.

**Code Style**: MUST use ESLint and Prettier with project configurations. Code MUST pass linting before commit (enforced via Husky pre-commit hooks).

**Rationale**: Clear documentation reduces onboarding time and maintenance burden. Consistent code style improves readability and reduces cognitive load during code reviews.

## Security and Compliance

### Vulnerability Management

**Dependency Auditing**: Run `npm audit` with every build. Address HIGH and CRITICAL vulnerabilities within 7 days. MODERATE vulnerabilities MUST be evaluated and addressed or documented as accepted risk.

**No Sensitive Data**: Instrumentation MUST NOT capture sensitive data (passwords, tokens, PII) by default. When capturing request/response data, MUST provide filtering mechanisms.

**Supply Chain Security**: All dependencies MUST be from trusted sources (npm registry). Verify package integrity. Use `package-lock.json` (lockfileVersion 3) to ensure reproducible builds.

### License Compliance

**MIT License**: All code MUST include the MIT license header:
```
/*
 * (c) Copyright IBM Corp. 2024
 */
```

**Dependency Licenses**: All production dependencies MUST have compatible licenses (MIT, Apache 2.0, BSD). GPL/AGPL dependencies are prohibited in production code.

## Development Workflow

### Branch Management

**Branch Naming**: Development branches MUST use prefixes: `feat-`, `fix-`, `chore-`, `docs-`, `test-`. Branch names MUST be lowercase alphanumeric with hyphens. Branches with these prefixes are auto-deleted after 60 days of inactivity.

**Main Branch Protection**: The `main` branch is protected. All changes MUST go through pull requests. Direct commits to `main` are prohibited.

### Commit Standards

**Conventional Commits**: MUST follow [Conventional Commits](https://www.conventionalcommits.org/) standard. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `build`.

**Customer-Facing Changes**: Use `feat` or `fix` for changes that appear in CHANGELOG. Use `chore` for internal changes. Breaking changes MUST include `BREAKING CHANGE:` footer.

**Sign-Off Required**: All commits MUST include sign-off: `Signed-off-by: Name <email@example.com>`

**Commit Message Length**: Subject line ≤ 72 characters. Body lines ≤ 100 characters. Reference tickets/issues in commit body.

### Code Review

**Required Approvals**: All PRs MUST have at least one approval from a team member. Breaking changes require two approvals.

**Review Checklist**:
- Tests pass and provide adequate coverage
- Code follows style guidelines (ESLint/Prettier)
- Documentation updated (if applicable)
- No security vulnerabilities introduced
- Performance impact assessed (if applicable)
- Backward compatibility maintained

### Release Process

**Automated Releases**: Use GitHub Actions workflow for releases. Lerna determines version bump from conventional commits. CHANGELOG files are auto-generated.

**Release Artifacts**: Each release publishes:
- npm packages to registry
- AWS Lambda layers
- AWS Fargate Docker images
- Google Cloud Run images

**Pre-releases**: Major versions MUST have pre-releases (`--dist-tag next --preid rc`) for user testing before stable release.

## Testing Standards

### Test Organization

**Test Structure**: Tests organized by type:
- `test/unit/` - Unit tests for individual modules
- `test/integration/` - Integration tests with real dependencies
- `test/contract/` - Contract tests for external interfaces

**Test Naming**: Test files MUST match source files with `.test.js` suffix. ESM variants MUST have `.test.mjs` suffix.

### Test Requirements

**Coverage Targets**: Aim for >80% code coverage. Critical paths (span processing, instrumentation) MUST have >90% coverage.

**Test Isolation**: Tests MUST be independent and runnable in any order. Use test containers (Docker Compose) for external dependencies.

**ESM Testing**: All instrumentation tests MUST have both CJS (`.js`) and ESM (`.mjs`) variants. Use `RUN_ESM=true` to run ESM tests locally.

### CI/CD Testing

**Multi-Version Testing**: Tests run against all supported Node.js versions (18, 20, 22, 23). Prerelease pipeline tests against Node.js RC and nightly builds.

**Platform Testing**: Tests run on Linux (primary), macOS (native addons), and Windows (compatibility).

**Long-Running Tests**: Separate pipeline for long-running tests (memory leaks, performance regression).

## Governance

### Constitution Authority

This constitution supersedes all other development practices and guidelines. When conflicts arise between this constitution and other documentation, the constitution takes precedence.

### Amendment Process

**Proposal**: Amendments MUST be proposed via pull request to `.specify/memory/constitution.md`. Proposal MUST include:
- Rationale for change
- Impact analysis on existing principles
- Migration plan (if applicable)

**Approval**: Amendments require approval from at least two team leads. Breaking changes to principles require team consensus.

**Version Bump**: Constitution follows semantic versioning:
- MAJOR: Principle removal or redefinition
- MINOR: New principle or section added
- PATCH: Clarifications, wording improvements

**Propagation**: After amendment, MUST update dependent templates (plan-template.md, spec-template.md, tasks-template.md) to reflect changes.

### Compliance Review

**PR Reviews**: All pull requests MUST verify compliance with constitution principles. Reviewers MUST explicitly check:
- Backward compatibility maintained
- Performance impact acceptable
- Tests written before implementation (or design-focused exception applies)
- Documentation updated

**Quarterly Audits**: Team conducts quarterly audits of codebase against constitution. Violations MUST be documented and remediated or explicitly accepted as technical debt.

### Complexity Justification

**Simplicity Principle**: Prefer simple solutions over complex ones (YAGNI). Complexity MUST be justified in terms of:
- User value delivered
- Technical necessity (performance, correctness)
- Simpler alternatives considered and rejected

**Complexity Tracking**: Use "Complexity Tracking" section in plan.md to document justified complexity. Unjustified complexity is a blocker for PR approval.

### Runtime Guidance

For day-to-day development guidance, refer to:
- `CONTRIBUTING.md` - Development setup and workflows
- `AGENTS.md` - Current feature context for AI agents
- Package-specific READMEs - Package-level documentation

**Version**: 1.1.0 | **Ratified**: 2026-04-24 | **Last Amended**: 2026-04-24
