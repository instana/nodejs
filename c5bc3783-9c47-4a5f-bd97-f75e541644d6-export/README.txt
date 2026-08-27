This bundle contains the files and folders for your Tekton Pipeline run. Below is a description of each file and folder:

1. `definition.yaml`
   This file contains the **pipeline definition** that was used for this run. The file is the aggregation for all tekton resources (EventListeners, Tasks, Steps, etc.) defined in the defintion section of the CD Pipeline.

2. `definitionRepositories.json`
   This file lists all the **definition repositories** added to the pipeline. It provides details about the sources of the pipeline definitions. These are the sources used to generate the `definition.yaml` file

3. `environmentProperties.json`
   Contains the list of **environment properties** that were set for this pipeline run. These properties were passed into the pipeline during its execution. The properties are those set for the pipeline and the trigger in the CD Pipeline

4. `eventParams.json`
   If the pipeline was triggered via a **Git** or **Generic** trigger, this file contains the **event payload** associated with that trigger.

5. `metadata.json`
   This file contains **metadata** about the pipeline run, including:
   - Build number
   - Pipeline ID
   - Completion state
   - Event header information
   - Trigger details
   - Worker information

6. `logs` (folder)
   This folder contains subfolders, each representing a **task** within the pipeline run. Inside each task folder, you will find one or more log files corresponding to each step in that task. These logs provide details on the execution process and help troubleshoot any issues.

7. `resultResources.yaml` / `resultResources.json`
   This file contains the kubernetes resource information associated with the pipeline run, including:
   - **PipelineRun** resource info
   - **TaskRun** resource info
   - **PodsList** resource info
   - **AgentLog** resource info

NOTE: You can find the private worker agent logs under the section labeled `kind: AgentLog` in this file, which provides insights, such as where the run executed, into the activities of the agent during the pipeline run.