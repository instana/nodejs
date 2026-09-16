# SPS Pipeline

Quick-reference guide for working with the IBM SPS CI pipelines in this repo.

- [Pipeline overview](#pipeline-overview)
- [Compliance](#compliance)
  - [detect-secrets](#detect-secrets)
  - [CVE / CRA](#cve--cra)
  - [Branch protection](#branch-protection)
- [Scripts](#scripts)
  - [Generate pipeline configs](#generate-pipeline-configs)
  - [Create triggers](#create-triggers)
  - [Run pipelines](#run-pipelines)
  - [Stop pipelines](#stop-pipelines)
  - [Remove triggers](#remove-triggers)
  - [Close compliance issues](#close-compliance-issues)

---

## Pipeline overview

One IBM Cloud Toolchain hosts all pipelines. Each trigger passes a different
`pipeline-config` property to select which YAML file to load, keeping runs
independent and parallel.

| Folder | Trigger | Event |
|---|---|---|
| `.sps/pipeline-config.yaml` (root) | SCM | `pull_request` — security checks only |
| `.sps/pr/` | SCM | `pull_request` — test groups |
| `.sps/main/` | SCM | `push` to `main` |
| `.sps/manual/` | Manual | on demand |
| `.sps/dependencies/` | Timer + Manual | daily bot runs |

> **Security checks** (`detect-secrets`, `compliance-checks`) run **once** — only in the
> root `pipeline-config.yaml`. All test-group configs disable those steps to avoid
> redundant scanning.

All YAML files under `pr/`, `main/`, and `manual/` are **generated** — do not edit them by hand.
Run the [generator](#generate-pipeline-configs) whenever you add a package, change a `.needs` file,
or modify the generator itself.

---

## Compliance

### detect-secrets

SPS requires the **IBM fork** of detect-secrets. The standard PyPI package will fail.

**Install once:**

```bash
pip install "git+https://github.com/IBM/detect-secrets.git@master#egg=detect-secrets"
detect-secrets --version   # must show 0.13.1+ibm.XX.dss
```

**Regenerate and audit before every commit that touches source files:**

```bash
detect-secrets scan --update .secrets.baseline
detect-secrets audit .secrets.baseline
```

`audit` opens an interactive prompt for each new finding — mark each as true/false positive.
The pipeline rejects a baseline with unaudited entries.

---

### CVE / CRA

CRA (Code Risk Analyzer) scans dependencies and Docker images for vulnerabilities.

| File | Purpose |
|---|---|
| `.cra/.fileignore` | Exclude paths from scanning. Entries are **literal prefixes** — globs not supported. |
| `.cra/.cveignore` | Suppress specific CVE findings. Requires `"alwaysOmit": true` per entry. |

Only add entries to `.cra/.cveignore` for false positives or CVEs with no available fix
(e.g. transitive dependencies).

---

### Branch protection

SPS `compliance-checks` validates that GitHub branch-protection rules exist on the
target repository. The required configuration lives in
[`.sps/branch-protection.json`](.sps/branch-protection.json).

Configure these rules in **GitHub → Repository Settings → Rules → Rulesets** on the `main` branch:

1. **Require a pull request before merging**
   - Set minimum approving reviews to **1**
   - Enable **Dismiss stale pull request approvals when new commits are pushed**

2. **Require status checks to pass before merging**
   - Enable **Require branches to be up to date before merging**
   - In the status checks search box, add each of the following:

   | Status check |
   |---|
   | `tekton/pr-code-checks/code-detect-secrets` |
   | `tekton/pr-code-checks/code-branch-protection` |
   | `tekton/pr-code-checks/code-vulnerability-scan` |
   | `tekton/pr-code-checks/code-unit-tests` |

   These names come directly from `.sps/branch-protection.json` — update that file if
   the set of required checks changes, then update the ruleset to match.

3. **Restrict push to `main`**
   - Block **force push**
   - Block **branch deletions**

> Reference: [IBM Cloud DevSecOps — Configure GitHub](https://test.cloud.ibm.com/docs/devsecops?topic=devsecops-cd-devsecops-config-github)

---

## Scripts

All scripts require `ibmcloud` CLI logged in and `jq` installed unless noted otherwise.

### Generate pipeline configs

Regenerate all YAML under `.sps/pr/`, `.sps/main/`, and `.sps/manual/`:

```bash
# Regenerate everything
node .sps/scripts/generate-pipeline-configs.js

# Regenerate a single group
node .sps/scripts/generate-pipeline-configs.js --what=collector-currencies-databases

# Regenerate only pr configs for one group
node .sps/scripts/generate-pipeline-configs.js --what=core-group --mode=pr

# Override Node.js version
node .sps/scripts/generate-pipeline-configs.js --node-version=22
```

<details>
<summary>Available <code>--what</code> targets</summary>

| Target | Description |
|---|---|
| `default` | Root `pipeline-config.yaml` (security checks only) |
| `collector-currencies-<group>` | One fan-out task per package in `currencies/<group>/` |
| `collector-metrics` | Tests under `test/integration/metrics/` |
| `collector-misc-and-unit` | Tests under `test/integration/misc/` plus unit tests |
| `core-group` | core, metrics-util, serverless, serverless-collector, shared-metrics |
| `cloud` | aws-lambda, aws-fargate, azure-container-services, google-cloud-run |
| `opentelemetry` | opentelemetry-exporter, opentelemetry-sampler |
| `autoprofile` | autoprofile package tests |
| `pr-general` | General PR checks (lint, format, build) |
| `pr-verify` | PR verification tasks |
| `upload-currency-report` | Uploads currency report artifact |

</details>

---

### Create triggers

Registers triggers in the IBM Cloud Toolchain. Existing triggers are skipped (idempotent).

```bash
# Preview without making changes
.sps/scripts/create-triggers.sh --dry-run

# Register all triggers
.sps/scripts/create-triggers.sh

# Register only dependency-bot triggers
.sps/scripts/create-triggers.sh --type=dependencies

# Register a single named trigger
.sps/scripts/create-triggers.sh --type=dependencies --name=manual-dep-currency-bot
```

| `--type` | Kind |
|---|---|
| `pr` | SCM `pull_request` |
| `main` | SCM `push` to `main` |
| `manual` | Manual on-demand |
| `dependencies` | Timer + Manual (bots) |

---

### Run pipelines

```bash
# List all available manual triggers
.sps/scripts/run-pipeline.sh --list

# Run all manual triggers (Node version from .nvmrc)
.sps/scripts/run-pipeline.sh --branch main

# Run with a specific Node version
.sps/scripts/run-pipeline.sh --branch main --node-version 20

# Run across multiple Node versions
.sps/scripts/run-pipeline.sh --branch main --node-version 18,20,22,24,26

# Run a single trigger group
.sps/scripts/run-pipeline.sh --branch main --node-version 20 --trigger collector-currencies-async

# Run with ESM mode enabled
.sps/scripts/run-pipeline.sh --branch main --node-version 24 --esm true

# Dry run — prints API payloads without making calls
.sps/scripts/run-pipeline.sh --branch main --node-version 20 --dry-run
```

**Full release build** across all configured Node versions (prompts for delay and skip list):

```bash
# Interactive
.sps/scripts/run-pipeline.sh --release

# Non-interactive with 3-minute delay between steps
.sps/scripts/run-pipeline.sh --release --delay 3

# Dry run
.sps/scripts/run-pipeline.sh --branch main --release --dry-run
```

---

### Stop pipelines

Cancels every actively running pipeline run on the toolchain.

```bash
# Dry run — lists runs that would be cancelled
.sps/scripts/stop-all-runs.sh --dry-run

# Cancel all active runs
.sps/scripts/stop-all-runs.sh
```

---

### Remove triggers

Deletes triggers from the toolchain. Useful when resetting or rebuilding from scratch.

```bash
# Dry run — lists triggers that would be removed
.sps/scripts/remove-all-triggers.sh --dry-run

# Remove all triggers
.sps/scripts/remove-all-triggers.sh

# Remove triggers matching a name substring
.sps/scripts/remove-all-triggers.sh --name=manual-dep-currency-bot
```

After removing, recreate with [`create-triggers.sh`](#create-triggers).

---

### Close compliance issues

SPS reports compliance failures as issues in [`instana/instana-issues`](https://github.ibm.com/instana/instana-issues).
Once the underlying problem is fixed, bulk-close matching issues:

> Requires [GitHub CLI (`gh`)](https://cli.github.com/) authenticated with access to `instana/instana-issues`.

```bash
# Dry run — lists matching open issues without modifying anything
.sps/scripts/close-compliance-reports.sh --pattern "CVE-2025-14505" --dry-run

# Live run — prompts for a comment, then closes each issue
.sps/scripts/close-compliance-reports.sh --pattern "CVE-2025-14505"

# Live run with an explicit comment
.sps/scripts/close-compliance-reports.sh --pattern "CVE-2025-14505" --comment "Fixed in PR #1234"
```

Always do a `--dry-run` first to confirm the match set.


## References

- [SPS PR pipeline structure](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#pr-pipeline-structure)
- [Pipeline-config v2 customization options](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#pipeline-config-v2-customization-options)
- [SPS Task-level options](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#task-level-options)
- [SPS Multi-arch workers](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#multi-arch-workers-v11-only)
- [IBM Cloud DevSecOps — Configure GitHub (branch protection)](https://test.cloud.ibm.com/docs/devsecops?topic=devsecops-cd-devsecops-config-github)