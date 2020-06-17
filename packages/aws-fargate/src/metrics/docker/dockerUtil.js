'use strict';

exports.convert = function convert(metadata, stats, previous, next) {
  const converted = {
    Id: metadata.DockerId,
    Created: metadata.CreatedAt,
    Started: metadata.StartedAt,
    Image: metadata.Image,
    Labels: metadata.Labels,
    Ports: metadata.Ports,
    NetworkMode:
      metadata.Networks && Array.isArray(metadata.Networks) && metadata.Networks.length > 0
        ? metadata.Networks[0].NetworkMode
        : undefined
  };

  // Metrics
  if (stats) {
    // Network metrics (usually only available if NetworkMode == bridge)
    if (stats.networks) {
      converted.network = {
        rx: {
          bytes: 0,
          dropped: 0,
          errors: 0,
          packets: 0
        },
        tx: {
          bytes: 0,
          packets: 0,
          errors: 0,
          dropped: 0
        }
      };
      Object.keys(stats.networks).forEach(networkId => {
        converted.network.rx.bytes += calculateDelta(stats, previous, next, ['networks', networkId, 'rx_bytes']);
        converted.network.rx.dropped += calculateDelta(stats, previous, next, ['networks', networkId, 'rx_dropped']);
        converted.network.rx.errors += calculateDelta(stats, previous, next, ['networks', networkId, 'rx_errors']);
        converted.network.rx.packets += calculateDelta(stats, previous, next, ['networks', networkId, 'rx_packets']);
        converted.network.tx.bytes += calculateDelta(stats, previous, next, ['networks', networkId, 'tx_bytes']);
        converted.network.tx.dropped += calculateDelta(stats, previous, next, ['networks', networkId, 'tx_dropped']);
        converted.network.tx.errors += calculateDelta(stats, previous, next, ['networks', networkId, 'tx_errors']);
        converted.network.tx.packets += calculateDelta(stats, previous, next, ['networks', networkId, 'tx_packets']);
      });
    }

    // CPU Usage
    if (stats.cpu_stats) {
      const onlineCPUs = stats.cpu_stats.online_cpus || 1;

      const cpuSystemDelta = calculateDelta(stats, previous, next, ['cpu_stats', 'system_cpu_usage']);

      converted.cpu = {};
      if (cpuSystemDelta > 0) {
        converted.cpu.total_usage = calculateCpuUsageFromDelta(stats, previous, next, cpuSystemDelta, onlineCPUs, [
          'cpu_stats',
          'cpu_usage',
          'total_usage'
        ]);
        converted.cpu.user_usage = calculateCpuUsageFromDelta(stats, previous, next, cpuSystemDelta, onlineCPUs, [
          'cpu_stats',
          'cpu_usage',
          'usage_in_usermode'
        ]);
        converted.cpu.system_usage = calculateCpuUsageFromDelta(stats, previous, next, cpuSystemDelta, onlineCPUs, [
          'cpu_stats',
          'cpu_usage',
          'usage_in_kernelmode'
        ]);
      }

      converted.cpu.throttling_count = calculateDelta(stats, previous, next, [
        'cpu_stats',
        'throttling_data',
        'periods'
      ]);
      converted.cpu.throttling_time = calculateDelta(stats, previous, next, [
        'cpu_stats',
        'throttling_data',
        'throttled_time'
      ]);

      // Memory
      if (stats.memory_stats) {
        converted.memory = {};
        if (stats.memory_stats.stats) {
          converted.memory.active_anon = stats.memory_stats.stats.active_anon;
          converted.memory.active_file = stats.memory_stats.stats.active_file;
          converted.memory.inactive_anon = stats.memory_stats.stats.inactive_anon;
          converted.memory.inactive_file = stats.memory_stats.stats.inactive_file;
          converted.memory.total_cache = stats.memory_stats.stats.total_cache;
          converted.memory.total_rss = stats.memory_stats.stats.total_rss;
        }
        converted.memory.usage = stats.memory_stats.usage;
        converted.memory.max_usage = stats.memory_stats.max_usage;
        converted.memory.limit = stats.memory_stats.limit;
      }

      // Block I/O
      if (
        stats.blkio_stats &&
        stats.blkio_stats.io_service_bytes_recursive &&
        Array.isArray(stats.blkio_stats.io_service_bytes_recursive)
      ) {
        converted.blkio = {
          blk_read: calculateBlkIoDelta(stats, previous, next, 'Read'),
          blk_write: calculateBlkIoDelta(stats, previous, next, 'Write')
        };
      }
    }
  }

  return converted;
};

function calculateDelta(stats, previous, next, path) {
  const value = copy(stats, next, path);
  let previousValue = get(previous, path);
  if (previousValue == null) {
    // assume no change if we do not have a value from last poll
    previousValue = value;
  }
  const delta = value - previousValue;
  return delta;
}

function calculateCpuUsageFromDelta(stats, previous, next, cpuSystemDelta, onlineCPUs, path) {
  const cpuDelta = calculateDelta(stats, previous, next, path);
  return calculateCpuUsage(cpuDelta, cpuSystemDelta, onlineCPUs);
}

function calculateCpuUsage(cpuDelta, systemDelta, onlineCPUs) {
  return cpuDelta > 0 && systemDelta > 0 ? (cpuDelta / systemDelta) * onlineCPUs : 0;
}

function get(obj, path) {
  if (obj == null) {
    return obj;
  }
  if (path.length > 1) {
    return get(obj[path[0]], path.slice(1));
  }
  return obj[path[0]];
}

function set(obj, path, value) {
  if (path.length > 1) {
    if (obj[path[0]] == null) {
      obj[path[0]] = {};
    }
    return set(obj[path[0]], path.slice(1), value);
  }
  obj[path[0]] = value;
}

function copy(from, to, path) {
  const value = get(from, path);
  set(to, path, value);
  return value;
}

function calculateBlkIoDelta(stats, previous, next, type) {
  next.blkio_stats = next.blkio_stats || {
    io_service_bytes_recursive: []
  };
  const value = copyBlkIo(
    stats.blkio_stats.io_service_bytes_recursive,
    next.blkio_stats.io_service_bytes_recursive,
    type
  );
  // assume no change if we do not have a value from last poll
  let previousValue = value;
  if (previous.blkio_stats && Array.isArray(previous.blkio_stats.io_service_bytes_recursive)) {
    previousValue = getBlkIo(previous.blkio_stats.io_service_bytes_recursive, type);
  }
  if (previousValue == null) {
    previousValue = value;
  }
  const delta = value - previousValue;
  return delta;
}

function copyBlkIo(from, to, type) {
  const value = getBlkIo(from, type);
  setBlkIo(to, type, value);
  return value;
}

function getBlkIo(array, type) {
  const valueObj = array.find(v => v.op === type);
  if (!valueObj) {
    return null;
  }
  return valueObj.value;
}

function setBlkIo(array, type, value) {
  const valueObj = array.find(v => v.op === type);
  if (!valueObj) {
    array.push({
      op: type,
      value
    });
  } else {
    valueObj.value = value;
  }
}
