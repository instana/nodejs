# Tekton

## Restrictions

- Slashes in branch names is not allowed.

## Linting

```sh
pnpm run tekton:lint
```

## Local testing

https://github.com/tektoncd/dashboard/blob/97700646be7728e36f01120131da8620ee69122f/docs/tutorial.md#prerequisites

## Generate files

```
cd .tekton
node generate-test-files.yaml
node generate-test-coverage.yaml
node generate-pipeline.yaml
```

## Migrate to a new cluster

- You need to add sub paths for the tekton files in Settings - Definitions
  - main .tekton/listeners
  - main .tekton/tasks
  - main .tekton/pipeline
  - main .tekton/tasks/test-groups