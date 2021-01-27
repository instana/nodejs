/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2020
 */

'use strict';

const CallSite = require('../profile').CallSite;
const Profile = require('../profile').Profile;

class AllocationSampler {
  constructor(profiler) {
    this.profiler = profiler;
    this.started = false;
    this.top = undefined;
  }

  test() {
    if (this.profiler.getOption('disableAllocationSampler')) {
      return false;
    }

    if (!this.profiler.addon.checkAllocationSampler()) {
      return false;
    }

    return true;
  }

  reset() {
    this.top = new CallSite(this.profiler, '', '', 0);
  }

  startSampler() {
    this.profiler.addon.startAllocationSampler();
  }

  stopSampler() {
    const allocationProfileRoot = this.profiler.addon.readAllocationProfile();
    this.profiler.addon.stopAllocationSampler();
    if (allocationProfileRoot) {
      const includeAgentFrames = this.profiler.getOption('includeAgentFrames');
      this.updateProfile(this.top, allocationProfileRoot.children, includeAgentFrames);
    }
  }

  updateProfile(parent, nodes, includeAgentFrames) {
    nodes.forEach(node => {
      // exclude/include profiler frames
      if (node.file_name && !includeAgentFrames && this.profiler.AGENT_FRAME_REGEXP.exec(node.file_name)) {
        return;
      }

      const child = parent.findOrAddChild(node.func_name, node.file_name, node.line_num);

      child.measurement += node.size;
      child.numSamples += node.count;

      this.updateProfile(child, node.children, includeAgentFrames);
    });
  }

  buildProfile(duration, timespan) {
    const roots = new Set();
    // eslint-disable-next-line no-restricted-syntax
    for (const child of this.top.children.values()) {
      roots.add(child);
    }

    const profile = new Profile(
      this.profiler,
      Profile.c.CATEGORY_MEMORY,
      Profile.c.TYPE_MEMORY_ALLOCATION_RATE,
      Profile.c.UNIT_BYTE,
      roots,
      duration,
      timespan
    );

    return profile;
  }
}

exports.AllocationSampler = AllocationSampler;
