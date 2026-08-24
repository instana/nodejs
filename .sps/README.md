# SPS Pipeline

This directory contains the **Secure Pipelines Service (SPS)** configuration for this repository.

## Configuration

* [`pipeline-config.yaml`](.sps/pipeline-config.yaml) – SPS pipeline definition using config version 2.
* [`.secrets.baseline`](.secrets.baseline) – Secrets detection configuration.
* [`.cra/.fileignore`](.cra/.fileignore) – Files excluded from compliance scanning.

Set `pipeline-config-filename` to:

```text id="51307"
.sps/pipeline-config.yaml
```

## Pipeline

The pipeline runs a `code-build` stage and then fans out into package and integration test tasks such as:

* `core-tests`
* `collector-*`
* `aws-lambda-tests-*`

Some collector and AWS Lambda test groups use **Docker-in-Docker (DinD)** to start required services for integration testing.

Fan-out tasks run in separate containers, so each task installs its dependencies before running tests.

## Secrets

SPS secrets are not stored in this repository. Configure them as secure pipeline properties in the IBM Cloud toolchain.

Required properties include:

* `git-token`
* `cos-api-key`
* `cos-bucket-name`
* `cos-endpoint`

## Compliance

`.secrets.baseline` is required for SPS detect-secrets validation.

### Generating `.secrets.baseline`

SPS requires the **IBM fork** of detect-secrets. The standard PyPI package will fail with:
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

**`.cra/.fileignore`** excludes paths from CRA scanning. Entries are literal path prefixes — globs are **not** supported. List each package path explicitly.

**`.cra/.cveignore`** overrides (suppresses) specific CVE findings reported against dependencies. Each entry requires a CVE identifier and `"alwaysOmit": true` to permanently suppress the finding across all scans.


> Use `.cra/.cveignore` only for false positives or CVEs that cannot be remediated (e.g. transitive dependencies with no fix available).

## References

* [SPS Task-level options](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#task-level-options)
* [SPS Multi-arch workers](https://pages.github.ibm.com/secure-pipelines-service/sps-docs/optimize/optimize/#multi-arch-workers-v11-only)


