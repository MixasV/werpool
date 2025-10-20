import json
from pathlib import Path

pkg = {
     name: api,
    private: True,
    type: module,
    scripts: {
        start:dev: nest start --watch,
        build: nest build,
        lint: eslint \src/**/*.ts"
 },
 dependencies: {
 @nestjs/common: ^10.0.0,
 @nestjs/core: ^10.0.0,
 @nestjs/platform-express: ^10.0.0,
 reflect-metadata: ^0.2.0,
 rxjs: ^7.8.1
 },
 devDependencies: {
 @nestjs/cli: ^10.4.5,
 @nestjs/schematics: ^10.1.2,
 @nestjs/testing: ^10.0.0,
 typescript: ^5.4.0,
 ts-node: ^10.9.1,
 tsconfig-paths: ^4.2.0,
 eslint: ^8.57.0,
 @typescript-eslint/eslint-plugin: ^7.0.0,
 @typescript-eslint/parser: ^7.0.0
 }
}

Path(r'D:\Scripts\Factory\Flow\apps\api\package.json').write_text(json.dumps(pkg, indent=2))
