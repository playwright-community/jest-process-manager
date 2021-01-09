# jest-process-manager

**This project was forked because the package [`jest-dev-server`](https://github.com/smooth-code/jest-puppeteer/tree/master/packages/jest-dev-server) is no longer maintained.**

[![CI](https://github.com/playwright-community/jest-process-manager/workflows/CI/badge.svg)](https://github.com/playwright-community/jest-process-manager/actions)
[![npm](https://img.shields.io/npm/v/jest-process-manager)](http://npmjs.com/package/jest-process-manager)

Starts a server before your Jest tests and tears it down after.

## Why

[`jest-playwright-preset`](https://github.com/playwright-community/jest-playwright) or `jest-puppeteer` works great for running tests in Jest using your preferred end-to-end testing library.
It's also useful for starting a local development server during the tests without letting Jest hang.
This package extracts just the local development server spawning without any ties to Puppeteer.

## Install

```bash
npm install --save-dev jest-process-manager
```

## Usage

`jest-process-manager` exports `setup`,`teardown` and `getServers` functions.

```js
// global-setup.js
const { setup: setupDevServer } = require('jest-process-manager')

module.exports = async function globalSetup() {
  await setupDevServer({
    command: `node config/start.js --port=3000`,
    launchTimeout: 50000,
    port: 3000,
  })
  // Your global setup
}
```

It is also possible to specify several servers:

```js
// global-setup.js
const { setup: setupDevServer } = require('jest-process-manager')

module.exports = async function globalSetup() {
  await setupDevServer([
    {
      command: 'node server.js',
      port: 4444,
    },
    {
      command: 'node server2.js',
      port: 4445,
    },
  ])
  // Your global setup
}
```

```js
// global-setup.js
const { setup: setupDevServer, getServers } = require('jest-process-manager')

module.exports = async function globalSetup() {
  await setupDevServer({
    command: `node config/start.js --port=3000`,
    launchTimeout: 50000,
    port: 3000,
  })
  getServers.then(servers => {
    // You can get to the servers and do whatever you want
  })
  // Your global setup
}
```

```js
// global-teardown.js
const { teardown: teardownDevServer } = require('jest-process-manager')

module.exports = async function globalTeardown() {
  await teardownDevServer()
  // Your global teardown
}
```

## Options

### `command`

Type: `string`, required.

Command to execute to start the port.
Directly passed to [`spawnd`](https://www.npmjs.com/package/spawnd).

```js
module.exports = {
  command: 'npm run start',
}
```

### `debug`

Type: `boolean`, default to `false`.

Log server output, useful if server is crashing at start.

```js
module.exports = {
  command: 'npm run start',
  debug: true,
}
```

### `launchTimeout`

Type: `number`, default to `5000`.

How many milliseconds to wait for the spawned server to be available before giving up.
Defaults to [`wait-port`](https://www.npmjs.com/package/wait-port)'s default.

```js
module.exports = {
  command: 'npm run start',
  launchTimeout: 30000,
}
```

---

Following options are linked to [`spawnd`](https://www.npmjs.com/package/spawnd).

### `host`

Type: `string`, default to `localhost`.

Host to wait for activity on before considering the server running.
Must be used in conjunction with `port`.

```js
module.exports = {
  command: 'npm run start --port 3000',
  host: 'customhost.com',
  port: 3000,
}
```

### `protocol`

Type: (`https`, `http`, `http-get`, `https-get`, `tcp`, `socket`) default to `tcp`.

To wait for an HTTP or TCP endpoint before considering the server running, include `http` or `tcp` as a protocol.
Must be used in conjunction with `port`.
This give you ability to define resource prefix for [`wait-on`](https://github.com/jeffbski/wait-on) package.

```js
module.exports = {
  command: 'npm run start --port 3000',
  protocol: 'http',
  port: 3000,
}
```

### `port`

Type: `number`, default to `3000`.

Port to wait for activity on before considering the server running.
If not provided, the server is assumed to immediately be running.

```js
module.exports = {
  command: 'npm run start --port 3000',
  port: 3000,
}
```

### `basePath`

Type: `string`

Option for a basePath where server is running.

```js
module.exports = {
  command: 'npm run start',
  basePath: '/myservice',
}
```

### `usedPortAction`

Type: `string` (`ask`, `error`, `ignore`, `kill`) default to `ask`.

It defines the action to take if port is already used:

- `ask`: a prompt is shown to decide if you want to kill the process or not
- `error`: an errow is thrown
- `ignore`: your test are executed, we assume that the server is already started
- `kill`: the process is automatically killed without a prompt

```js
module.exports = {
  command: 'npm run start --port 3000',
  port: 3000,
  usedPortAction: 'kill',
}
```

### `waitOnScheme`

`jest-dev-server` use the [`wait-on`](https://www.npmjs.com/package/wait-on) npm package to wait for resources to become available before calling callback.

Type: `object`, default to `{}`.

- `delay`: optional initial delay in ms, default 0
- `interval`: optional poll resource interval in ms, default 250ms
- `log`: optional flag which outputs to stdout, remaining resources waited on and when complete or errored
- `reverse`: optional flag to reverse operation so checks are for resources being NOT available, default false
- `timeout`: optional timeout in ms, default Infinity. Aborts with error
- `tcpTimeout`: optional tcp timeout in ms, default 300ms
- `verbose`: optional flag which outputs debug output, default false
- `window`: optional stabilization time in ms, default 750ms. Waits this amount of time for file sizes to stabilize or other resource availability to remain unchanged

**Note:** http(s) specific options, see https://github.com/request/request#readme for specific details

```js
module.exports = {
  command: 'npm run start --port 3000',
  port: 3000,
  usedPortAction: 'kill',
  waitOnScheme: {
    delay: 1000,
  },
}
```

### `options`

Options which will be passed down to the [spawn](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options) of the process. For example environment variables:

```js
// global-setup.js
const { setup: setupDevServer, getServers } = require('jest-process-manager')

module.exports = async function globalSetup() {
  await setupDevServer({
    command: `node config/start.js --port=3000`,
    launchTimeout: 50000,
    port: 3000,
    options: {
      env: {
        "FOO": "bar",
      }
    }
  })
  getServers.then(servers => {
    // You can get to the servers and do whatever you want
  })
  // Your global setup
}
```

## Troubleshooting

- If using `port` makes the terminal to ask for root password although the port is valid and accessible then use `usePortAction: 'ignore'`.

## License

https://github.com/playwright-community/jest-process-manager/blob/master/LICENSE
