## Prebuilds

### Requirement

From lando/lando#3533

```sh
sudo ln -s ~/.rd/docker.sock /var/run/docker.sock
```

On M1 please deleted the file and then recreate it to address the connectivity problem with the Docker daemon.

### Supported OS / Arch

Supported os: 
    - linux
    - darwin

Supported arch:
    - alpine (x64 musl)
    - centos7-devtoolset7 (x64 glibc)
    - linux/arm64
    - linux/armv6
    - linux/armv7


### Rebuilding existing Node.js versions

```sh
node scripts/prebuilds.js                               [build all abi version for darwin and linux]
node scripts/prebuilds.js --os=darwin                   [build all abi version only for darwin]
node scripts/prebuilds.js --os=linux                    [build all abi version only for linux]
node scripts/prebuilds.js --os=linux --arch linux-arm64 [build all abi version only for linux arm64]
node scripts/prebuilds.js --abi=14.0.0                  [build specific abi version]
node scripts/prebuilds.js --abi=14.0.0,21.0.0           [build specific abi versions]
```

### Adding support for a new Node.js version

```sh
node scripts/prebuilds.js --abi=22.0.0                  [build specific abi version]
```