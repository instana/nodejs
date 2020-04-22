'use strict';

const CallSite = require('../profile').CallSite;
const Profile = require('../profile').Profile;


class AllocationSampler {
  constructor(profiler) {
    let self = this;

    self.profiler = profiler;
    self.started = false;
    self.top = undefined;
  }


  test() {
    let self = this;

    if (self.profiler.getOption('allocationSamplerDisabled')) {
      return false;
    }

    if (!self.profiler.addon.checkAllocationSampler()) {
      return false;
    }

    return true;
  }


  reset() {
    let self = this;

    self.top = new CallSite(self.profiler, '', '', 0);
  }


  startSampler() {
    let self = this;

    self.profiler.addon.startAllocationSampler();
  }


  stopSampler() {
    let self = this;

    let allocationProfileRoot = self.profiler.addon.readAllocationProfile();
    self.profiler.addon.stopAllocationSampler();
    if (allocationProfileRoot) {
      let includeAgentFrames = self.profiler.getOption('includeAgentFrames');
      self.updateProfile(self.top, allocationProfileRoot.children, includeAgentFrames);
    }
  }


  updateProfile(parent, nodes, includeAgentFrames) {
    let self = this;

    nodes.forEach((node) => {
      // exclude/include profiler frames
      if (node.file_name &&
          !includeAgentFrames &&
          self.profiler.AGENT_FRAME_REGEXP.exec(node.file_name)) {
        return;
      }

      let child = parent.findOrAddChild(node.func_name, node.file_name, node.line_num);

      child.measurement += node.size;
      child.numSamples += node.count;

      self.updateProfile(child, node.children, includeAgentFrames);
    });
  }


  buildProfile(duration, timespan) {
    let self = this;

    let roots = new Set();
    for (let child of self.top.children.values()) {
      roots.add(child);
    }

    let profile = new Profile(
      self.profiler,
      Profile.c.CATEGORY_MEMORY,
      Profile.c.TYPE_MEMORY_ALLOCATION_RATE,
      Profile.c.UNIT_BYTE,
      roots,
      duration,
      timespan);

    return profile;
  }
}

exports.AllocationSampler = AllocationSampler;
