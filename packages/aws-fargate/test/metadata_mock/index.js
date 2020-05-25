/* eslint-disable consistent-return */

'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const morgan = require('morgan');
const pino = require('pino')();

const sendToParent = require('../../../serverless/test/util/send_to_parent');

const logPrefix = 'metadata-v3';
const logger = pino.child({ name: logPrefix, pid: process.pid });
logger.level = 'info';

const port = process.env.METADATA_MOCK_PORT || 1604;

const app = express();

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix} (${process.pid}): :method :url :status`));
}

app.use(bodyParser.json());

const awsAccount = '555123456789';
const clusterName = 'nodejs-fargate-test-cluster';
const taskDefinitionName = 'nodejs-fargate-test-task-definition';
const taskDefinitionVersion = '42';
const containerName = 'nodejs-fargate-test-container';

app.get('/', (req, res) => {
  res.json({
    DockerId: '01234567890abcdef01234567890abcdef01234567890abcdef01234567890ab',
    Name: containerName,
    DockerName: `ecs-${taskDefinitionName}-${taskDefinitionVersion}-${containerName}-abcdefg0123456789012`,
    Image: `${awsAccount}.dkr.ecr.us-east-2.amazonaws.com/${taskDefinitionName}:latest`,
    ImageID: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    Labels: {
      'com.amazonaws.ecs.cluster': `arn:aws:ecs:us-east-2:${awsAccount}:cluster/${clusterName}`,
      'com.amazonaws.ecs.container-name': containerName,
      'com.amazonaws.ecs.task-arn': `arn:aws:ecs:us-east-2:${awsAccount}:task/55566677-c1e5-5780-9806-aabbccddeeff`,
      'com.amazonaws.ecs.task-definition-family': taskDefinitionName,
      'com.amazonaws.ecs.task-definition-version': taskDefinitionVersion
    },
    DesiredStatus: 'RUNNING',
    KnownStatus: 'RUNNING',
    Limits: {
      CPU: 0,
      Memory: 0
    },
    CreatedAt: '2020-03-25T14:34:29.936120727Z',
    StartedAt: '2020-03-25T14:34:31.56264157Z',
    Type: 'NORMAL',
    Networks: [
      {
        NetworkMode: 'awsvpc',
        IPv4Addresses: ['166.66.66.66']
      }
    ]
  });
});

app.get('/task', (req, res) => {
  res.json({
    Cluster: `arn:aws:ecs:us-east-2:${awsAccount}:cluster/${clusterName}`,
    TaskARN: `arn:aws:ecs:us-east-2:${awsAccount}:task/55566677-c1e5-5780-9806-aabbccddeeff`,
    Family: taskDefinitionName,
    Revision: taskDefinitionVersion,
    DesiredStatus: 'RUNNING',
    KnownStatus: 'RUNNING',
    Containers: [
      {
        DockerId: '1f11d3be4668926ba50c5a6049bf75103f9c708cb70ad967d96e27fd914067ec',
        Name: '~internal~ecs~pause',
        DockerName: `ecs-${taskDefinitionName}-${taskDefinitionVersion}-internalecspause-ae908be6e2a8f2a42600`,
        Image: 'fg-proxy:tinyproxy',
        ImageID: '',
        Labels: {
          'com.amazonaws.ecs.cluster': `arn:aws:ecs:us-east-2:${awsAccount}:cluster/${clusterName}`,
          'com.amazonaws.ecs.container-name': '~internal~ecs~pause',
          'com.amazonaws.ecs.task-arn': `arn:aws:ecs:us-east-2:${awsAccount}:task/55566677-c1e5-5780-9806-aabbccddeeff`,
          'com.amazonaws.ecs.task-definition-family': taskDefinitionName,
          'com.amazonaws.ecs.task-definition-version': taskDefinitionVersion
        },
        DesiredStatus: 'RESOURCES_PROVISIONED',
        KnownStatus: 'RESOURCES_PROVISIONED',
        Limits: {
          CPU: 0,
          Memory: 0
        },
        CreatedAt: '2020-03-25T14:34:24.398289614Z',
        StartedAt: '2020-03-25T14:34:25.640268364Z',
        Type: 'CNI_PAUSE',
        Networks: [
          {
            NetworkMode: 'awsvpc',
            IPv4Addresses: ['166.66.66.67']
          }
        ]
      },
      {
        DockerId: '997e57ae749f276626b99f81aa8a193183580d327145aeb22cf1a675decaedba',
        Name: containerName,
        DockerName: `ecs-${taskDefinitionName}-${taskDefinitionVersion}-${containerName}-ece0aff5d49f9a96b501`,
        Image: `${awsAccount}.dkr.ecr.us-east-2.amazonaws.com/${taskDefinitionName}:latest`,
        ImageID: 'sha256:2ffe52a8f590e72b96dd5c586252afac8de923673c5b2fd0b04e081684c47f6b',
        Labels: {
          'com.amazonaws.ecs.cluster': `arn:aws:ecs:us-east-2:${awsAccount}:cluster/${clusterName}`,
          'com.amazonaws.ecs.container-name': containerName,
          'com.amazonaws.ecs.task-arn': `arn:aws:ecs:us-east-2:${awsAccount}:task/55566677-c1e5-5780-9806-aabbccddeeff`,
          'com.amazonaws.ecs.task-definition-family': taskDefinitionName,
          'com.amazonaws.ecs.task-definition-version': taskDefinitionVersion
        },
        DesiredStatus: 'RUNNING',
        KnownStatus: 'RUNNING',
        Limits: {
          CPU: 0,
          Memory: 0
        },
        CreatedAt: '2020-03-25T14:34:29.936120727Z',
        StartedAt: '2020-03-25T14:34:31.56264157Z',
        Type: 'NORMAL',
        Networks: [
          {
            NetworkMode: 'awsvpc',
            IPv4Addresses: ['166.66.66.67']
          }
        ]
      }
    ],
    Limits: {
      CPU: 0.25,
      Memory: 512
    },
    PullStartedAt: '2020-03-25T14:34:25.75886719Z',
    PullStoppedAt: '2020-03-25T14:34:29.92587709Z'
  });
});

app.get('/stats', (req, res) => {
  res.json({
    read: '2020-03-25T14:35:20.355666414Z',
    preread: '2020-03-25T14:35:19.342026094Z',
    pids_stats: {
      current: 7
    },
    blkio_stats: {
      io_service_bytes_recursive: [],
      io_serviced_recursive: [],
      io_queue_recursive: [],
      io_service_time_recursive: [],
      io_wait_time_recursive: [],
      io_merged_recursive: [],
      io_time_recursive: [],
      sectors_recursive: []
    },
    num_procs: 0,
    storage_stats: {},
    cpu_stats: {
      cpu_usage: {
        total_usage: 298079958,
        percpu_usage: [110074358, 188005600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        usage_in_kernelmode: 30000000,
        usage_in_usermode: 220000000
      },
      system_cpu_usage: 192900000000,
      online_cpus: 2,
      throttling_data: {
        periods: 0,
        throttled_periods: 0,
        throttled_time: 0
      }
    },
    precpu_stats: {
      cpu_usage: {
        total_usage: 298079958,
        percpu_usage: [110074358, 188005600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        usage_in_kernelmode: 30000000,
        usage_in_usermode: 220000000
      },
      system_cpu_usage: 190880000000,
      online_cpus: 2,
      throttling_data: {
        periods: 0,
        throttled_periods: 0,
        throttled_time: 0
      }
    },
    memory_stats: {
      usage: 10035200,
      max_usage: 12677120,
      stats: {
        active_anon: 6610944,
        active_file: 0,
        cache: 0,
        dirty: 0,
        hierarchical_memory_limit: 536870912,
        hierarchical_memsw_limit: 9223372036854772000,
        inactive_anon: 0,
        inactive_file: 2158592,
        mapped_file: 0,
        pgfault: 4560,
        pgmajfault: 0,
        pgpgin: 5708,
        pgpgout: 3567,
        rss: 8769536,
        rss_huge: 0,
        total_active_anon: 6610944,
        total_active_file: 0,
        total_cache: 0,
        total_dirty: 0,
        total_inactive_anon: 0,
        total_inactive_file: 2158592,
        total_mapped_file: 0,
        total_pgfault: 4560,
        total_pgmajfault: 0,
        total_pgpgin: 5708,
        total_pgpgout: 3567,
        total_rss: 8769536,
        total_rss_huge: 0,
        total_unevictable: 0,
        total_writeback: 0,
        unevictable: 0,
        writeback: 0
      },
      limit: 4134825984
    },
    name: `/ecs-${taskDefinitionName}-${taskDefinitionVersion}-${containerName}-ece0aff5d49f9a96b501`,
    id: '997e57ae749f276626b99f81aa8a193183580d327145aeb22cf1a675decaedba'
  });
});

app.get('/task/stats', (req, res) => {
  res.json({
    '1f11d3be4668926ba50c5a6049bf75103f9c708cb70ad967d96e27fd914067ec': {
      read: '2020-03-25T14:35:20.354472882Z',
      preread: '2020-03-25T14:35:19.349680976Z',
      pids_stats: {
        current: 7
      },
      blkio_stats: {
        io_service_bytes_recursive: [
          {
            major: 202,
            minor: 26368,
            op: 'Read',
            value: 5890048
          },
          {
            major: 202,
            minor: 26368,
            op: 'Write',
            value: 12288
          },
          {
            major: 202,
            minor: 26368,
            op: 'Sync',
            value: 5902336
          },
          {
            major: 202,
            minor: 26368,
            op: 'Async',
            value: 0
          },
          {
            major: 202,
            minor: 26368,
            op: 'Total',
            value: 5902336
          }
        ],
        io_serviced_recursive: [
          {
            major: 202,
            minor: 26368,
            op: 'Read',
            value: 342
          },
          {
            major: 202,
            minor: 26368,
            op: 'Write',
            value: 3
          },
          {
            major: 202,
            minor: 26368,
            op: 'Sync',
            value: 345
          },
          {
            major: 202,
            minor: 26368,
            op: 'Async',
            value: 0
          },
          {
            major: 202,
            minor: 26368,
            op: 'Total',
            value: 345
          }
        ],
        io_queue_recursive: [],
        io_service_time_recursive: [],
        io_wait_time_recursive: [],
        io_merged_recursive: [],
        io_time_recursive: [],
        sectors_recursive: []
      },
      num_procs: 0,
      storage_stats: {},
      cpu_stats: {
        cpu_usage: {
          total_usage: 382891193,
          percpu_usage: [279795620, 103095573, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          usage_in_kernelmode: 130000000,
          usage_in_usermode: 220000000
        },
        system_cpu_usage: 192890000000,
        online_cpus: 2,
        throttling_data: {
          periods: 0,
          throttled_periods: 0,
          throttled_time: 0
        }
      },
      precpu_stats: {
        cpu_usage: {
          total_usage: 382864191,
          percpu_usage: [279795620, 103068571, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          usage_in_kernelmode: 130000000,
          usage_in_usermode: 220000000
        },
        system_cpu_usage: 190900000000,
        online_cpus: 2,
        throttling_data: {
          periods: 0,
          throttled_periods: 0,
          throttled_time: 0
        }
      },
      memory_stats: {
        usage: 11857920,
        max_usage: 15220736,
        stats: {
          active_anon: 3915776,
          active_file: 4341760,
          cache: 5963776,
          dirty: 16384,
          hierarchical_memory_limit: 536870912,
          hierarchical_memsw_limit: 9223372036854772000,
          inactive_anon: 0,
          inactive_file: 1622016,
          mapped_file: 2183168,
          pgfault: 5959,
          pgmajfault: 51,
          pgpgin: 7466,
          pgpgout: 5054,
          rss: 3915776,
          rss_huge: 0,
          total_active_anon: 3915776,
          total_active_file: 4341760,
          total_cache: 5963776,
          total_dirty: 16384,
          total_inactive_anon: 0,
          total_inactive_file: 1622016,
          total_mapped_file: 2183168,
          total_pgfault: 5959,
          total_pgmajfault: 51,
          total_pgpgin: 7466,
          total_pgpgout: 5054,
          total_rss: 3915776,
          total_rss_huge: 0,
          total_unevictable: 0,
          total_writeback: 0,
          unevictable: 0,
          writeback: 0
        },
        limit: 4134825984
      },
      name: `/ecs-${taskDefinitionName}-${taskDefinitionVersion}-internalecspause-ae908be6e2a8f2a42600`,
      id: '1f11d3be4668926ba50c5a6049bf75103f9c708cb70ad967d96e27fd914067ec'
    },
    '997e57ae749f276626b99f81aa8a193183580d327145aeb22cf1a675decaedba': {
      read: '2020-03-25T14:35:20.355666414Z',
      preread: '2020-03-25T14:35:19.342026094Z',
      pids_stats: {
        current: 7
      },
      blkio_stats: {
        io_service_bytes_recursive: [],
        io_serviced_recursive: [],
        io_queue_recursive: [],
        io_service_time_recursive: [],
        io_wait_time_recursive: [],
        io_merged_recursive: [],
        io_time_recursive: [],
        sectors_recursive: []
      },
      num_procs: 0,
      storage_stats: {},
      cpu_stats: {
        cpu_usage: {
          total_usage: 298079958,
          percpu_usage: [110074358, 188005600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          usage_in_kernelmode: 30000000,
          usage_in_usermode: 220000000
        },
        system_cpu_usage: 192900000000,
        online_cpus: 2,
        throttling_data: {
          periods: 0,
          throttled_periods: 0,
          throttled_time: 0
        }
      },
      precpu_stats: {
        cpu_usage: {
          total_usage: 298079958,
          percpu_usage: [110074358, 188005600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          usage_in_kernelmode: 30000000,
          usage_in_usermode: 220000000
        },
        system_cpu_usage: 190880000000,
        online_cpus: 2,
        throttling_data: {
          periods: 0,
          throttled_periods: 0,
          throttled_time: 0
        }
      },
      memory_stats: {
        usage: 10035200,
        max_usage: 12677120,
        stats: {
          active_anon: 6610944,
          active_file: 0,
          cache: 0,
          dirty: 0,
          hierarchical_memory_limit: 536870912,
          hierarchical_memsw_limit: 9223372036854772000,
          inactive_anon: 0,
          inactive_file: 2158592,
          mapped_file: 0,
          pgfault: 4560,
          pgmajfault: 0,
          pgpgin: 5708,
          pgpgout: 3567,
          rss: 8769536,
          rss_huge: 0,
          total_active_anon: 6610944,
          total_active_file: 0,
          total_cache: 0,
          total_dirty: 0,
          total_inactive_anon: 0,
          total_inactive_file: 2158592,
          total_mapped_file: 0,
          total_pgfault: 4560,
          total_pgmajfault: 0,
          total_pgpgin: 5708,
          total_pgpgout: 3567,
          total_rss: 8769536,
          total_rss_huge: 0,
          total_unevictable: 0,
          total_writeback: 0,
          unevictable: 0,
          writeback: 0
        },
        limit: 4134825984
      },
      name: `/ecs-${taskDefinitionName}-${taskDefinitionVersion}-${containerName}-ece0aff5d49f9a96b501`,
      id: '997e57ae749f276626b99f81aa8a193183580d327145aeb22cf1a675decaedba'
    }
  });
});

app.listen(port, () => {
  logger.info('Listening on port: %s', port);
  sendToParent('metadata mock: started');
});
