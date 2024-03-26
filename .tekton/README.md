# Tekton

## Restrictions

- Slashes in branch names is not allowed.

## Local testing

https://github.com/tektoncd/dashboard/blob/97700646be7728e36f01120131da8620ee69122f/docs/tutorial.md#prerequisites

## Generate files

```
cd .tekton
node generate-test-files.yaml
node generate-test-coverage.yaml
node generate-pipeline.yaml
```