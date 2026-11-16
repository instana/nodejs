# dev-cli

Developer CLI for the Instana Node.js repository. Each task is a command in [`commands/`](./commands) and is
registered in [`index.js`](./index.js).

```
npm run dev-cli -- --help
npm run dev-cli -- <command> --help
```

The `--` after `npm run dev-cli` is required so that npm passes the flags on to the CLI. Otherwise npm consumes flags
such as `--prefix` and `--dry-run` itself.

## Commands

### `cleanup-aws`

Lists the AWS resources of one service in all regions of an AWS account and deletes them after confirmation. By
default **all** resources of the service are listed. Use `--created-by-me` to only consider the ones you created.
Services are selected with `--service` (default: `lambda`). Currently supported:

| Service    | Resources        | Creation event used for `--created-by-me` |
| ---------- | ---------------- | ----------------------------------------- |
| `lambda`   | Lambda functions | `CreateFunction`                          |
| `s3`       | S3 buckets       | `CreateBucket`                            |
| `dynamodb` | DynamoDB tables  | `CreateTable`                             |
| `kinesis`  | Kinesis streams  | `CreateStream`                            |
| `sns`      | SNS topics       | `CreateTopic`                             |
| `sqs`      | SQS queues       | `CreateQueue`                             |

**S3 deletes data:** a bucket can only be deleted when empty, so `--service s3` first removes **all objects, all
versions and all delete markers** of every selected bucket, then the bucket itself. This cannot be undone.

**Credentials:** the CLI reads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` from the
environment. It never asks for credentials. Set them in your shell first, e.g. with an MFA helper:

```sh
awstoken <MFA-CODE>
```

**Usage:**

```sh
# List all Lambda functions in all enabled regions (nothing is deleted)
npm run dev-cli -- cleanup-aws --dry-run

# Only the functions created by you
npm run dev-cli -- cleanup-aws --dry-run --created-by-me --regions us-east-1

# Narrow down by name prefix and region
npm run dev-cli -- cleanup-aws --prefix teamnodejstracer- --regions us-east-1 eu-west-1

# Delete after confirmation (drop --dry-run)
npm run dev-cli -- cleanup-aws --created-by-me --regions us-east-1
```

| Option            | Description                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `--service`       | The AWS service to clean up (default: `lambda`)                                          |
| `--dry-run`       | Only list the resources, never delete anything                                           |
| `--prefix`        | Only consider resources whose name starts with this prefix                               |
| `--created-by-me` | Only consider resources created by you (determined via CloudTrail, last 90 days only)    |
| `--regions`       | Only scan these regions (default: all enabled regions of the account)                    |
