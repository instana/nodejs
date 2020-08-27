'use strict';

const { environment: environmentUtil } = require('@instana/serverless');

const DataProcessor = require('../DataProcessor');

class EcsTaskProcessor extends DataProcessor {
  constructor(dataSource) {
    super('com.instana.plugin.aws.ecs.task', [['taskDefinition'], ['taskDefinitionVersion']]);
    this.addSource('snapshot', dataSource);
  }

  getEntityId() {
    if (this.entityId != null) {
      return this.entityId;
    }
    const rawData = this._compileRawData();
    if (!rawData.snapshot) {
      return null;
    }
    this.entityId = rawData.snapshot.TaskARN;
    return this.entityId;
  }

  canSkipRecompilation() {
    return false;
  }

  processData(rawDataPerSource) {
    const metadata = rawDataPerSource.snapshot;
    return {
      taskArn: metadata.TaskARN,
      clusterArn: metadata.Cluster,
      taskDefinition: metadata.Family,
      taskDefinitionVersion: metadata.Revision,
      availabilityZone: metadata.AvailabilityZone,
      instanaZone: environmentUtil.getCustomZone(),
      desiredStatus: metadata.DesiredStatus,
      knownStatus: metadata.KnownStatus,
      limits: {
        cpu: metadata.Limits.CPU,
        memory: metadata.Limits.Memory
      },
      pullStartedAt: metadata.PullStartedAt,
      pullStoppedAt: metadata.PullStoppedAt,
      tags: environmentUtil.getTags()
    };
  }
}

module.exports = exports = EcsTaskProcessor;
