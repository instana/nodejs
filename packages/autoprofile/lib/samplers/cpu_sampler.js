/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const CallSite = require('../profile').CallSite;
const Profile = require('../profile').Profile;

const DEFAULT_SAMPLING_INTERVAL = 10000; // microseconds

class CpuSampler {
  constructor(profiler) {
    this.profiler = profiler;

    this.top = undefined;
    this.profileSamples = undefined;
  }

  test() {
    if (this.profiler.getOption('disableCpuSampler')) {
      return false;
    }

    return true;
  }

  reset() {
    this.top = new CallSite(this.profiler, '', '', 0);
    this.profileSamples = 0;
  }

  startSampler() {
    // cpuSamplingInterval is in microseconds
    let samplingInterval = this.profiler.getOption('cpuSamplingInterval');
    if (!samplingInterval || samplingInterval < 100 || samplingInterval > 100000) {
      samplingInterval = DEFAULT_SAMPLING_INTERVAL;
    }
    this.profiler.addon.startCpuSampler(samplingInterval);
  }

  stopSampler() {
    const cpuProfileRoot = this.profiler.addon.stopCpuSampler();
    if (cpuProfileRoot) {
      const includeAgentFrames = this.profiler.getOption('includeAgentFrames');
      this.updateProfile(this.top, cpuProfileRoot.children, includeAgentFrames);
    }
  }

  buildProfile(duration, timespan) {
    const roots = new Set();
    // eslint-disable-next-line no-restricted-syntax
    for (const child of this.top.children.values()) {
      roots.add(child);
    }

    const profile = new Profile(
      this.profiler,
      Profile.c.CATEGORY_CPU,
      Profile.c.TYPE_CPU_USAGE,
      Profile.c.UNIT_SAMPLE,
      roots,
      duration,
      timespan
    );

    return profile;
  }

  updateProfile(parent, nodes, includeAgentFrames) {
    nodes.forEach(node => {
      this.profileSamples += node.hit_count;

      if (node.func_name === '(program)') {
        return;
      }

      // exclude/include profiler frames
      if (node.file_name && !includeAgentFrames && this.profiler.AGENT_FRAME_REGEXP.exec(node.file_name)) {
        return;
      }

      const child = parent.findOrAddChild(node.func_name, node.file_name, node.line_num);

      child.measurement += node.hit_count;
      child.numSamples += node.hit_count;

      this.updateProfile(child, node.children, includeAgentFrames);
    });
  }
}

exports.CpuSampler = CpuSampler;
