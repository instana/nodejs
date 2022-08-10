#######################################
# (c) Copyright IBM Corp. 2022
#######################################

set -eo pipefail

RELEASE_TYPE=$(node_modules/.bin/conventional-recommended-bump --preset conventionalcommits)

if [[ $RELEASE_TYPE = major ]]; then
  echo "Erro: There have been breaking changes since the last release, so this release would be a major release. This Github action does not support publishing major releases, only minor and patch releases are supported (for now). See CONTRIBUTING.md for more information."
  exit 1
fi

if [[ $RELEASE_TYPE != minor ]] && [[ $RELEASE_TYPE != patch ]]; then
  echo "Error: Unexpected release type: $RELEASE_TYPE, expected major, minor or patch."
  exit 1
fi

