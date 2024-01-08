## Prebuilds

### Darwin

$ npx prebuildify -t node@14.0.0 -t node@16.0.0 -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip --arch x64

$ npx prebuildify -t node@14.0.0 -t node@16.0.0 -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip --arch arm64

### Linux

From https://github.com/lando/lando/issues/3533
> $ sudo ln -s ~/.rd/docker.sock /var/run/docker.sock

> $ npx prebuildify-cross --modules ../../node_modules -i linux-arm64 -t node@14.0.0 -t node@16.0.0 -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip

// x64 glibc
> $ npx prebuildify-cross --modules ../../node_modules -i centos7-devtoolset7 -t node@14.0.0 -t node@16.0.0 -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip

// x64 musl
> $ npx prebuildify-cross --modules ../../node_modules -i alpine -t node@14.0.0 -t node@16.0.0 -t node@18.0.0 -t node@20.0.0 -t node@21.0.0 --strip