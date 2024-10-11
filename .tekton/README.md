# Tekton

## Restrictions

- Slashes in branch names is not allowed.

## Linting

```sh
npm run tekton:lint
```

## Local Testing

Follow the instructions provided in the [Tekton Dashboard tutorial](https://github.com/tektoncd/dashboard/blob/97700646be7728e36f01120131da8620ee69122f/docs/tutorial.md#prerequisites).

## Generate Files

To generate/update the required Tekton pipeline files, run the following commands:

```
cd .tekton
node generate-default-pipeline.js
node generate-test-files.js
```

## Migrate to a New Cluster

- You will need to add subpaths for the Tekton files under **Settings** > **Definitions**:
  - `main .tekton/listeners`
  - `main .tekton/tasks`
  - `main .tekton/pipeline`
  - `main .tekton/tasks/test-groups`
