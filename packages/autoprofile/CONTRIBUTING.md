## Prebuilds

### Requirement

From lando/lando#3533

```sh
sudo ln -s ~/.rd/docker.sock /var/run/docker.sock
```

On M1 please delete the file and then recreate it to address the connectivity problem with the Docker daemon.

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
node scripts/prebuilds.js --os=darwin --node=14.0.0                   [build v14 only for darwin]
node scripts/prebuilds.js --os=linux  --node=18.0.0                   [build v14 only for linux]
node scripts/prebuilds.js --os=linux --arch=linux-arm64 --node=18.0.0 [build v18 only for linux arm64]
node scripts/prebuilds.js --node=14.0.0                               [build specific node version]
node scripts/prebuilds.js --node=14.0.0,21.0.0                        [build specific node versions]
```

### Adding support for a new Node.js version

```sh
node scripts/prebuilds.js --node=22.0.0                               [build specific node version]
```