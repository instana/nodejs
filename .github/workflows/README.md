# GH Local testing

brew install act

# for Rancher
export DOCKER_HOST=$(docker context inspect --format '{{.Endpoints.docker.Host}}')

touch .secrets

act --list
act workflow_dispatch -j create-jira-card --secret-file ./.github/workflows/.secrets
