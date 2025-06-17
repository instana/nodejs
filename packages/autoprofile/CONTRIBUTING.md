## Prebuilds

### Requirements

From lando/lando#3533

```sh
sudo ln -s ~/.rd/docker.sock /var/run/docker.sock
```

On M1 please delete the file and then recreate it to address the connectivity problem with the Docker daemon.

Switch to the Node.js version:

```
nvm use v22.0.0      [target prebuild Node.js version]
```

You might need to update `node-gyp` in the package.json!

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
    - linux/s390x


### Rebuilding existing Node.js versions

```sh
node scripts/prebuilds.js --os=darwin --node=20.0.0                   [build v20 only for darwin]
node scripts/prebuilds.js --os=linux  --node=18.0.0                   [build v18 only for linux]
node scripts/prebuilds.js --os=linux --arch=linux-arm64 --node=18.0.0 [build v18 only for linux arm64]
node scripts/prebuilds.js --node22.0.0                               [build specific node version]
node scripts/prebuilds.js --node=22.0.0,21.0.0                        [build specific node versions]
```

### Adding support for a new Node.js version

```sh
node scripts/prebuilds.js --node=22.0.0                               [build specific node version]
```

### Troubleshooting

If you encounter an error like the following:

```
Error: Could not detect abi for version 23.0.0 and runtime node.
```
Solution:

Update [`node-abi`](https://www.npmjs.com/package/node-abi), a sub-dependency of `prebuildify`, to the latest version for Node.js compatibility.