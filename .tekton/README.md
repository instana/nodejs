# Tekton

## Private Workers

- Strong hardware
- We cannot use scheduing technique "isolated-pipeline" (1 pipeline per node),
  because we use PVC, ReadOnce and Workspaces.
- Its better to have very strong hardware (120 CPU, 360 MEM), which
  can handle multiple pipelines on a single node.
- Limit 1 pipeline per node (not reliable, but its running okay):

```sh
$ kubectl -n tekton-pipelines create cm default-pod-template \
  --from-literal=pod-template='{
    "topologySpreadConstraints":[
      {
        "maxSkew": 1,
        "topologyKey":"kubernetes.io/hostname",
        "whenUnsatisfiable":"DoNotSchedule",
        "labelSelector":{
          "matchExpressions":[
            { "key":"tekton.dev/pipelineRun", "operator":"Exists" }
          ]
        }
      }
    ]
  }' \
  --dry-run=client -o yaml | kubectl apply -f -

$ kubectl -n tekton-pipelines rollout restart deploy tekton-pipelines-controller
$ kubectl -n tekton-pipelines rollout restart deploy tekton-pipelines-webhook
```

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

## Troubleshooting

> QPS Limit exceeded

`registryPullQPS` is default 5 in the IBMCloud and you cannot configure it.
We are using `imagePullPolicy: IfNotPresent` to not pull the image
if it already exists. You jsut to rerun the build to not run into the problem.
As soon as the Node worker has enough images cached, the error disappears.
