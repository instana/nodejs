'use strict';

const CallSite = require('../profile').CallSite;
const Profile = require('../profile').Profile;


class CpuSampler {
  constructor(profiler) {
    let self = this;

    self.profiler = profiler;

    self.top = undefined;
    self.profileSamples = undefined;
  }


  test() {
    let self = this;

    if (self.profiler.getOption('cpuSamplerDisabled')) {
      return false;
    }

    return true;
  }


  reset() {
    let self = this;

    self.top = new CallSite(self.profiler, '', '', 0);
    self.profileSamples = 0;
  }


  startSampler() {
    let self = this;

    self.profiler.addon.startCpuSampler();
  }


  stopSampler() {
    let self = this;

    let cpuProfileRoot = self.profiler.addon.stopCpuSampler();
    if (cpuProfileRoot) {
      let includeAgentFrames = self.profiler.getOption('includeAgentFrames');
      self.updateProfile(self.top, cpuProfileRoot.children, includeAgentFrames);
    }
  }


  buildProfile(duration, timespan) {
    let self = this;


    let roots = new Set();
    for (let child of self.top.children.values()) {
      roots.add(child);
    }

    let profile = new Profile(
      self.profiler,
      Profile.c.CATEGORY_CPU,
      Profile.c.TYPE_CPU_USAGE,
      Profile.c.UNIT_SAMPLE,
      roots,
      duration,
      timespan);

    return profile;
  }


  updateProfile(parent, nodes, includeAgentFrames) {
    let self = this;

    nodes.forEach((node) => {
      self.profileSamples += node.hit_count;

      if (node.func_name === '(program)') {
        return;
      }

      // exclude/include profiler frames
      if (node.file_name &&
          !includeAgentFrames &&
          self.profiler.AGENT_FRAME_REGEXP.exec(node.file_name)) {
        return;
      }

      let child = parent.findOrAddChild(node.func_name, node.file_name, node.line_num);

      child.measurement += node.hit_count;
      child.numSamples += node.hit_count;

      self.updateProfile(child, node.children, includeAgentFrames);
    });
  }
}

exports.CpuSampler = CpuSampler;

