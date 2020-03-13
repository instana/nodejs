#!/usr/bin/env bash

set -eo pipefail

$(aws ecr get-login --region us-east-2 | sed 's/-e none //')
