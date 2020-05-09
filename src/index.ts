/* eslint-disable no-console */
import stream from 'stream'
import net from 'net'
import chalk from 'chalk'
import cwd from 'cwd'
import waitOn, { WaitOnOptions } from 'wait-on'
import findProcess from 'find-process'
import { promisify } from 'util'
import treeKill from 'tree-kill'
import prompts from 'prompts'

import { spawn, ChildProcess } from 'child_process'
import exit from 'exit'
import onExit from 'signal-exit'

const pTreeKill = promisify(treeKill)

type CustomSpawnD = ReturnType<typeof spawn> & {
  destroy: () => Promise<void>
}

function spawnd(command: string, options: Parameters<typeof spawn>[1]): CustomSpawnD {
  const cleanExit = (code = 1) => {
    if (proc && proc.pid) {
      treeKill(proc.pid, () => exit(code))
    } else {
      exit(code)
    }
  }

  const proc = spawn(command, options)
  proc.stderr.pipe(process.stderr)
  proc.on('exit', cleanExit)
  proc.on('error', () => cleanExit(1))

  const removeExitHandler = onExit(code => {
    cleanExit(typeof code === 'number' ? code : 1)
  });

  (proc as CustomSpawnD).destroy = async (): Promise<void> => {
    removeExitHandler()
    proc.removeAllListeners('exit')
    proc.removeAllListeners('error')
    return pTreeKill(proc.pid).catch(() => {
      /* ignore error */
    })
  }
  return proc as CustomSpawnD
}

interface JestProcessManagerOptions {
  /**
   * Command to execute to start the port. Directly passed to spawnd.
   *
   * ```js
   * module.exports = {
   *   command: 'npm run start',
   * }
   * ```
   */
  command: string;

  /**
   * Log server output, useful if server is crashing at start.
   * @default false
   * ```js
   * module.exports = {
   *   command: 'npm run start',
   *   debug: true,
   * }
   * ```
   */
  debug?: boolean;

  /**
   * How many milliseconds to wait for the spawned server to be available before giving up. Defaults to wait-port's default.
   * @default 5000
   * ```js
   * module.exports = {
   *   command: 'npm run start',
   *   launchTimeout: 30000,
   * }
   * ```
   */
  launchTimeout?: number;

  /**
   * Host to wait for activity on before considering the server running. Must be used in conjunction with port.
   * @default 'localhost'
   *
   * ```js
   * module.exports = {
   *   command: 'npm run start --port 3000',
   *   host: 'customhost.com',
   *   port: 3000
   * }
   * ```
   */
  host?: string;

  /**
   * To wait for an HTTP or TCP endpoint before considering the server running, include http or tcp as a protocol. Must be used in conjunction with port.
   * @default 'tcp'
   * ```js
   * module.exports = {
   *   command: 'npm run start --port 3000',
   *   protocol: 'http',
   *   port: 3000,
   * }
   * ```
   */
  protocol?: 'https' | 'http' | 'tcp' | 'socket';

  /**
   * Port to wait for activity on before considering the server running. If not provided, the server is assumed to immediately be running.
   * @default null
   *
   * ```js
   * module.exports = {
   *   command: 'npm run start --port 3000',
   *   port: 3000,
   * }
   * ```
   */
  port: number;

  /**
   * It defines the action to take if port is already used:
   * @default 'ask'
   *
   * - ask: a prompt is shown to decide if you want to kill the process or not
   * - error: an errow is thrown
   * - ignore: your test are executed, we assume that the server is already started
   * - kill: the process is automatically killed without a prompt
   *
   * ```js
   * module.exports = {
   *   command: 'npm run start --port 3000',
   *   port: 3000,
   *   usedPortAction: 'kill',
   * }
   */
  usedPortAction: 'ask' | 'error' | 'ignore' | 'kill';

  /**
   * jest-dev-server uses the wait-on npm package to wait for resources to become available before calling callback.
   * @default {}
   *
   * ```js
   * module.exports = {
   *   command: 'npm run start --port 3000',
   *   port: 3000,
   *   usedPortAction: 'kill',
   *   waitOnScheme: {
   *     delay: 1000,
   *   },
   * }
   */
  waitOnScheme?: Partial<WaitOnOptions>;

  /**
   * Options which will be passed down to the spawn of the process
   */
  options?: Parameters<typeof spawn>[1]
}

const DEFAULT_CONFIG: JestProcessManagerOptions = {
  debug: false,
  options: {},
  launchTimeout: 5000,
  host: 'localhost',
  port: 3000,
  protocol: 'tcp',
  usedPortAction: 'ask',
  waitOnScheme: {},
}

const serverLogPrefixer = new stream.Transform({
  transform(chunk, encoding, callback) {
    this.push(chalk.magentaBright(`[Jest Dev server] ${chunk.toString()}`))
    callback()
  },
})

export const ERROR_TIMEOUT = 'ERROR_TIMEOUT'
export const ERROR_PORT_USED = 'ERROR_PORT_USED'
export const ERROR_NO_COMMAND = 'ERROR_NO_COMMAND'
export class JestDevServerError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

const servers: CustomSpawnD[] = []

const logProcDetection = (procName: string, port: number) => {
  console.log(
    chalk.blue(
      `🕵️  Detecting a process "${procName}" running on port "${port}"`,
    ),
  )
}

type Unwrap<T> = T extends (...args: any) => Promise<infer U> ? U : T

async function killProc(proc: Unwrap<typeof findProcess>[0]): Promise<void> {
  console.log(chalk.yellow(`Killing process ${proc.name}...`))
  await pTreeKill(proc.pid)
  console.log(chalk.green(`Successfully killed process ${proc.name}`))
}

function runServer(config: JestProcessManagerOptions, index: number) {
  if (!config.command) {
    throw new JestDevServerError(
      'You must define a `command`',
      ERROR_NO_COMMAND,
    )
  }

  servers[index] = spawnd(config.command, {
    shell: true,
    env: process.env,
    cwd: cwd(),
    ...config.options,
  })

  if (config.debug) {
    // eslint-disable-next-line no-console
    console.log(chalk.magentaBright('\nJest dev-server output:'))
    servers[index].stdout!.pipe(serverLogPrefixer).pipe(process.stdout)
  }
}

async function outOfStin<T>(block: () => Promise<T>) {
  const { stdin } = process
  const listeners = stdin.listeners('data')
  const result = await block()
  // @ts-ignore
  listeners.forEach(listener => stdin.on('data', listener))
  stdin.setRawMode(true)
  stdin.setEncoding('utf8')
  stdin.resume()
  return result
}

function getIsPortTaken(config: JestProcessManagerOptions) {
  let server: net.Server
  const cleanupAndReturn: (val: boolean) => void = result =>
    new Promise(resolve => server.once('close', () => resolve(result)).close())
  return new Promise((resolve, reject) => {
    server = net
      .createServer()
      .once('error', (err: JestDevServerError) =>
        err.code === 'EADDRINUSE' ? resolve(cleanupAndReturn(true)) : reject(),
      )
      .once('listening', () => resolve(cleanupAndReturn(false)))
      .listen(config.port, config.host)
  })
}

export async function setup(providedConfigs: JestProcessManagerOptions | JestProcessManagerOptions[]): Promise<void> {
  // Compatible with older versions
  const configs = Array.isArray(providedConfigs)
    ? providedConfigs
    : [providedConfigs]
  await Promise.all(
    configs.map((providedConfig, index) =>
      setupJestServer(providedConfig, index),
    ),
  )
}

async function setupJestServer(providedConfig: JestProcessManagerOptions, index: number) {
  const config = { ...DEFAULT_CONFIG, ...providedConfig }

  const usedPortHandlers = {
    error() {
      throw new JestDevServerError(
        `Port ${config.port} is in use`,
        ERROR_PORT_USED,
      )
    },
    async kill() {
      console.log('')
      console.log(
        `Killing process listening to ${config.port}. On linux, this may require you to enter your password.`,
      )
      const [portProcess] = await findProcess('port', config.port)
      logProcDetection(portProcess.name, config.port)
      await killProc(portProcess)
    },
    async ask() {
      console.log('')
      const answers = await outOfStin<{ kill: boolean }>(() =>
        prompts({
          type: 'confirm',
          name: 'kill',
          message: `Another process is listening on ${config.port}. Should I kill it for you? On linux, this may require you to enter your password.`,
          initial: true,
        }),
      )
      if (answers.kill) {
        const [portProcess] = await findProcess('port', config.port)
        logProcDetection(portProcess.name, config.port)
        await killProc(portProcess)
      } else {
        process.exit(1)
      }
    },
    ignore() { },
  }

  const usedPortHandler = usedPortHandlers[config.usedPortAction]
  if (!usedPortHandler) {
    const availableActions = Object.keys(usedPortHandlers)
      .map(action => `\`${action}\``)
      .join(', ')
    throw new JestDevServerError(
      `Invalid \`usedPortAction\`, only ${availableActions} are possible`,
    )
  }

  if (config.port) {
    const isPortTaken = await getIsPortTaken(config)
    if (isPortTaken) {
      await usedPortHandler()
    }

    if (config.usedPortAction === 'ignore' && isPortTaken) {
      console.log('')
      console.log('Port is already taken. Assuming server is already running.')
    } else {
      runServer(config, index)
    }
  } else {
    runServer(config, index)
  }

  if (config.port) {
    const { launchTimeout, protocol, host, port, waitOnScheme } = config

    let url = ''
    if (protocol === 'tcp' || protocol === 'socket') {
      url = `${protocol}:${host}:${port}`
    } else {
      url = `${protocol}://${host}:${port}`
    }
    const opts = {
      resources: [url],
      timeout: launchTimeout,
      ...waitOnScheme,
    }

    try {
      await waitOn(opts)
    } catch (err) {
      throw new JestDevServerError(
        `Server has taken more than ${launchTimeout}ms to start.`,
        ERROR_TIMEOUT,
      )
    }
  }
}

export function getServers(): ChildProcess[] {
  return servers
}

export async function teardown(): Promise<void> {
  if (servers.length) {
    await Promise.all(servers.map(server => server.destroy()))
  }
}
