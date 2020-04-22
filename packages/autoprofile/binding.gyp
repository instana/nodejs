{
  "targets": [
    {
      "target_name": "autoprofile-addon",
      "sources": [
        "src/autoprofile_addon.cc",
        "src/cpu_sampler.cc",
        "src/allocation_sampler.cc"
      ],
      "include_dirs": ["<!(node -e \"require('nan')\")"]
    }
  ]
}
