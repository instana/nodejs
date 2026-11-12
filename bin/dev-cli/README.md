# dev-cli

Developer CLI for the Instana Node.js repository. Each task is a command in [`commands/`](./commands) and is
registered in [`index.js`](./index.js).

```
npm run dev-cli -- --help
npm run dev-cli -- <command> --help
```

The `--` after `npm run dev-cli` is required so that npm passes the flags on to the CLI.

## Commands

### `cleanup-aws`

Lists the AWS resources of one service **created by you** in all regions of an AWS account and deletes them after
confirmation. Services are selected with `--service` (default: `lambda`). Currently supported:

| Service  | Resources        |
| -------- | ---------------- |
| `lambda` | Lambda functions |

**Credentials:** the CLI reads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` from the
environment. It never asks for credentials. Set them in your shell first, e.g. with an MFA helper:

```sh
awstoken <MFA-CODE>
```

**Usage:**

```sh
# List only (Lambda is the default service)
npm run dev-cli -- cleanup-aws --dry-run --regions us-east-1

# Same, with the service named explicitly
npm run dev-cli -- cleanup-aws --service lambda --dry-run --regions us-east-1

# Scan all enabled regions, then delete after confirmation
npm run dev-cli -- cleanup-aws

# Narrow down by name prefix and region
npm run dev-cli -- cleanup-aws --prefix teamnodejstracer- --regions us-east-1 eu-west-1
```

| Option      | Description                                                           |
| ----------- | --------------------------------------------------------------------- |
| `--service` | The AWS service to clean up (default: `lambda`)                       |
| `--dry-run` | Only list the resources, never delete anything                        |
| `--prefix`  | Only consider resources whose name starts with this prefix            |
| `--regions` | Only scan these regions (default: all enabled regions of the account) |

