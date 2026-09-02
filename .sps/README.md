# SPS Pipeline

## Table of contents

- [Overview](#overview)
  - [Pipeline flavours](#pipeline-flavours)
- [Configuration files](#configuration-files)
- [Pipeline structure](#pipeline-structure)
  - [Task name convention](#task-name-convention)
  - [Docker services](#docker-services-databases-message-brokers)
- [Generating pipeline configs](#generating-pipeline-configs)
- [Registering triggers](#registering-triggers)
- [Running a pipeline manually](#running-a-pipeline-manually)
- [Stopping all active runs](#stopping-all-active-runs)
- [Secrets](#secrets)
- [Compliance](#compliance)
  - [Branch protection](#branch-protection)
  - [detect-secrets baseline](#detect-secrets-baseline)
  - [CRA (Code Risk Analyzer)](#cra-code-risk-analyzer)
- [Closing compliance issues](#closing-compliance-issues)
- [References](#references)

## Overview

Each test group has its own `pipeline-config-*.yaml`. A single IBM Cloud Toolchain
pipeline hosts all of them; each trigger passes a different `pipeline-config` property
to select which YAML to load. This keeps runs independent and parallel.

### Pipeline flavours

| Folder | Trigger type | Event | Root task |
|---|---|---|---|
| `.sps/pipeline-config.yaml` (root) | SCM | `pull_request` | `pr-code-checks` |
| `.sps/pr/` | SCM | `pull_request` | `pr-code-checks` |
| `.sps/main/` | SCM | `push` (branch: `main`) | `code-build` |
| `.sps/manual/` | Manual | n/a | `code-build` |

**Security checks run once** — only the root `pipeline-config.yaml` / `pr/pipeline-config.yaml`
carry live `detect-secrets`, `compliance-checks`, and `peer-review` steps. All test-group
configs disable those steps (`when: 'false'`) to avoid redundant scanning across
dozens of parallel tasks.

Set `pipeline-config-filename` in the IBM Cloud Toolchain to:

```text
.sps/pipeline-config.yaml
```

Each trigger then overrides `pipeline-config` at run time to point at its own
group-specific file (e.g. `.sps/pr/pipeline-config-core-group.yaml`).

## Configuration files

| Path | Purpose |
|---|---|
| [`.sps/pipeline-config.yaml`](.sps/pipeline-config.yaml) | Root default — used for `pipeline-config-filename`. Security checks only, no tests. |
| [`.sps/pr/`](.sps/pr/) | PR configs — one file per test group. |
| [`.sps/main/`](.sps/main/) | Main-commit configs — mirrors of `pr/` with `code-build` task names. |
| [`.sps/manual/`](.sps/manual/) | Manual-run configs — identical to `main/`. |
| [`.sps/assets/docker-services.json`](.sps/assets/docker-services.json) | Service definitions used by DinD tasks (image, env, args for each Docker service). |
| [`.sps/scripts/generate-pipeline-configs.js`](.sps/scripts/generate-pipeline-configs.js) | Generator — produces all YAML under `pr/`, `main/`, `manual/`. |
| [`.sps/scripts/create-triggers.sh`](.sps/scripts/create-triggers.sh) | Registers all triggers in the IBM Cloud Toolchain via API. |
| [`.sps/scripts/run-pipeline.sh`](.sps/scripts/run-pipeline.sh) | Fires a manual trigger by name. |
| [`.secrets.baseline`](.secrets.baseline) | Secrets detection baseline required by SPS. |
| [`.cra/.fileignore`](.cra/.fileignore) | Paths excluded from CRA compliance scanning. |

## Pipeline structure

Each test-group config follows a **root + fan-out** pattern:

```
pr-code-checks  (root — runs first)
  steps:
    - peer-review        → disabled (when: 'false')
    - detect-secrets     → disabled (when: 'false')
    - compliance-checks  → disabled (when: 'false')
    - unit-test          → npm install + create-version-test-folders

pr-code-checks-<name>  (fan-out child — runs in parallel after root)
  from: pr-code-checks
  runtimeClassName: large
  steps:
    - peer-review        → disabled
    - detect-secrets     → disabled
    - compliance-checks  → disabled
    - unit-test          → run the actual test suite
```

The root default config (`pipeline-config.yaml` / `pr/pipeline-config.yaml`) is
**minimal**: only `peer-review` is disabled; `detect-secrets` and `compliance-checks`
run normally so security scanning still happens exactly once per PR / commit.

### Task name convention

| Pipeline type | Root task | Fan-out task prefix |
|---|---|---|
| PR (`pr/`) | `pr-code-checks` | `pr-code-checks-<name>` |
| Main / Manual (`main/`, `manual/`) | `code-build` | `code-build-<name>` |

### Docker services (databases, message brokers)

SPS does not support native Tekton sidecars. Tests that need an external service
(Redis, MySQL, Elasticsearch, Kafka, etc.) use **DinD** (Docker-in-Docker):

1. The task declares `include: [dind]` — SPS injects the DinD runtime.
2. The `unit-test` step declares `include: [docker-socket]` — mounts `/var/run/docker.sock`.
3. The step script installs `docker-ce-cli` via apt, then starts each service:
   ```bash
   docker run -d --network host --name <service> <image> ...
   sleep 60   # wait for readiness
   ```

Service definitions (image, environment variables, startup arguments) live in
[`.sps/assets/docker-services.json`](.sps/assets/docker-services.json).

**`.needs` files** declare which Docker services a test folder requires. Place a `.needs`
file next to the test folder listing one service name per line (names match entries
in [`.sps/assets/docker-services.json`](.sps/assets/docker-services.json)):

```
# packages/collector/test/integration/currencies/messaging/kafkajs/.needs
zookeeper
kafka
kafka-topics
```

The generator reads `.needs` files automatically and adds `include: [dind]`,
`include: [docker-socket]`, and the appropriate `docker run` calls to the generated
task. **If a test folder needs a sidecar, add a `.needs` file — do not edit the
generated YAML.**

## Generating pipeline configs

All YAML files under `.sps/pr/`, `.sps/main/`, and `.sps/manual/` are
**code-generated** — do not edit them by hand. Re-run the generator whenever
you add a new currency package, add/change a `.needs` file, or modify the generator
itself.

```bash
# Regenerate all configs (pr + main + manual)
node .sps/scripts/generate-pipeline-configs.js

# Regenerate a single group, all modes
node .sps/scripts/generate-pipeline-configs.js --what=collector-currencies-databases

# Regenerate only pr configs for one group
node .sps/scripts/generate-pipeline-configs.js --what=core-group --mode=pr
```

Available `--what` targets:

| Target | Description |
|---|---|
| `default` | Root `pipeline-config.yaml` (security-checks only) |
| `collector-currencies-<group>` | One fan-out task per package in `currencies/<group>/` |
| `collector-metrics` | Tests under `test/integration/metrics/` |
| `collector-misc` | Tests under `test/integration/misc/` |
| `core-group` | core, metrics-util, serverless, serverless-collector, shared-metrics |
| `cloud` | aws-lambda, aws-fargate, azure-container-services, google-cloud-run |
| `opentelemetry` | opentelemetry-exporter, opentelemetry-sampler |
| `autoprofile` | autoprofile package tests |

## Registering triggers

After generating configs, register all triggers in the toolchain once:

```bash
# Dry run first — no API calls
.sps/scripts/create-triggers.sh --dry-run

# Live run
.sps/scripts/create-triggers.sh
```

Requires `ibmcloud` CLI logged in and `jq` installed. Existing triggers are skipped
(idempotent).

## Running a pipeline manually

```bash
# List all available manual triggers
.sps/scripts/run-pipeline.sh --list

# Run all manual triggers on a branch with Node 20
.sps/scripts/run-pipeline.sh --branch main --node-version 20

# Run a single group
.sps/scripts/run-pipeline.sh --branch main --node-version 20 \
  --trigger collector-currencies-async

# Dry run — prints the API payload without making calls
.sps/scripts/run-pipeline.sh --branch main --node-version 20 --dry-run
```

## Stopping all active runs

Use [`.sps/scripts/stop-all-runs.sh`](.sps/scripts/stop-all-runs.sh) to cancel every
actively running pipeline run on the toolchain in one shot.

```bash
# Dry run — lists runs that would be cancelled without making any API calls
.sps/scripts/stop-all-runs.sh --dry-run

# Live run — cancels all active runs
.sps/scripts/stop-all-runs.sh
```

## Secrets

SPS secrets are not stored in this repository. Configure them as secure pipeline
properties in the IBM Cloud toolchain.

Required properties:

| Property | Source |
|---|---|
| `git-token` | Enterprise Token in 1Password |
| `cos-api-key` | IBM Cloud Object Storage credentials |
| `cos-bucket-name` | Target COS bucket |
| `cos-endpoint` | COS regional endpoint |

## Compliance

### Branch protection

SPS `compliance-checks` validates that GitHub branch-protection rules are in place
on the target repository. The required settings are:

- **Require pull request reviews** before merging (at least one approving review).
- **Require status checks to pass** before merging — add the relevant SPS pipeline
  checks as required status checks.
- **Restrict who can push** to `main` directly (no force-push, no deletions).

Configure these rules in **GitHub → Repository Settings → Branches → Branch protection rules**.

> Full configuration reference: [IBM Cloud DevSecOps — Configure GitHub](https://test.cloud.ibm.com/docs/devsecops?topic=devsecops-cd-devsecops-config-github)

### detect-secrets baseline

`.secrets.baseline` is required for SPS detect-secrets validation. SPS requires the
**IBM fork** of detect-secrets. The standard PyPI package will fail with:
`"The Detect Secrets baseline file present in your repository is not of the IBM version"`.

Install the IBM fork once:

```bash
pip install "git+https://github.com/IBM/detect-secrets.git@master#egg=detect-secrets"
detect-secrets --version   # must show 0.13.1+ibm.XX.dss
```

**Whenever you modify any source file, regenerate and audit the baseline before committing:**

```bash
detect-secrets scan --update .secrets.baseline
detect-secrets audit .secrets.baseline
```

> `detect-secrets audit` opens an interactive prompt for each new potential secret found.
> Mark each finding as a true/false positive. The pipeline will reject a baseline that has
> unaudited entries.

### CRA (Code Risk Analyzer)

CRA scans the repository for vulnerabilities in dependencies and Docker images.

**`.cra/.fileignore`** excludes paths from CRA scanning. Entries are literal path
prefixes — globs are **not** supported. List each package path explicitly.

**`.cra/.cveignore`** overrides (suppresses) specific CVE findings reported against
dependencies. Each entry requires a CVE identifier and `"alwaysOmit": true` to
permanently suppress the finding across all scans.

> Use `.cra/.cveignore` only for false positives or CVEs that cannot be remediated
> (e.g. transitive dependencies with no fix available).

## Closing compliance issues

When a pipeline run raises issues in `instana/instana-issues` (e.g. branch-protection
or CRA BOM failures), use [`bin/close-matched-prs.sh`](bin/close-matched-prs.sh) to
bulk-comment and close them once the underlying problem is fixed.

**Requires** the [GitHub CLI (`gh`)](https://cli.github.com/) authenticated with
access to `instana/instana-issues`.

```bash
# Dry run — lists matching open issues without modifying anything (default)
./bin/close-matched-prs.sh "CVE-2025-14505"

# Live run — prompts for confirmation, then comments "fixed the case" and closes each issue
./bin/close-matched-prs.sh "CVE-2025-14505" false
```

The first argument is a **title substring** matched against all open issues in
`instana/instana-issues`. The second argument is `true` (dry run, default) or `false`
(live). Always do a dry run first to confirm the match set before closing.

## References

- [SPS PR pipeline structure](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#pr-pipeline-structure)
- [Pipeline-config v2 customization options](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#pipeline-config-v2-customization-options)
- [SPS Task-level options](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#task-level-options)
- [SPS Multi-arch workers](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#multi-arch-workers-v11-only)
- [IBM Cloud DevSecOps — Configure GitHub (branch protection)](https://test.cloud.ibm.com/docs/devsecops?topic=devsecops-cd-devsecops-config-github)