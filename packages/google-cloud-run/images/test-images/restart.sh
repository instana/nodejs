set -eo pipefail

cd `dirname $BASH_SOURCE`

source utils

NODEJS_VERSION=$1
if [[ -z "${NODEJS_VERSION-}" ]]; then
  echo 'Missing parameter: Node.js version'
  exit 1
fi

LINUX_DISTRIBUTION=$2
if [[ -z "${LINUX_DISTRIBUTION-}" ]]; then
  LINUX_DISTRIBUTION=standard
fi

if [[ ! -f .env ]]; then
  echo .env file is missing
  exit 1
fi
source .env

if [[ -z "${container_name_prefix-}" ]]; then
  echo Please set metadata_v1 in .env.
  exit 1
fi

setContainerName $container_name_prefix $NODEJS_VERSION $LINUX_DISTRIBUTION

docker stop $container_name && docker start $container_name --attach
