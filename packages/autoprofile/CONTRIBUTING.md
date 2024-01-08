## Prebuilds

```sh
node scripts/prebuilds.js                      [build all abi version for darwin and linux]
node scripts/prebuilds.js --os=darwin          [build all abi version only for darwin]
node scripts/prebuilds.js --os=linux           [build all abi version only for linux]
node scripts/prebuilds.js --abi=14             [build specific abi version]
node scripts/prebuilds.js --abi=14,21          [build specific abi versions]
```