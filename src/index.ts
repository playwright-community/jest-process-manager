/* eslint-disable no-console */
import stream from 'stream'
import net from 'net'
import chalk from 'chalk'
import cwd from 'cwd'
import waitOn from 'wait-on'
import findProcess from 'find-process'
import { promisify } from 'util'
import treeKill from 'tree-kill'
import prompts from 'prompts'

import { spawn, exec } from 'child_process'
import exit from 'exit'
import onExit from 'signal-exit'

import type { ChildProcess, SpawnOptions } from 'child_process'
import type { CustomSpawnD, JestProcessManagerOptions } from './types';

import { DEFAULT_CONFIG, ERROR_NO_COMMAND, ERROR_PORT_USED, ERROR_TIMEOUT } from './constants';

const pTreeKill = promisify(treeKill)
const pExec = promisify(exec);

function spawnd(command: string, options: SpawnOptions): CustomSpawnD {
  const proc = <CustomSpawnD>spawn(command, options)
  const cleanExit = (code = 1) => {
    if (proc?.pid) {
      treeKill(proc.pid, () => exit(code))
    } else {
      exit(code)
    }
  }
  if (proc.stderr !== null) {
    proc.stderr.pipe(process.stderr)
  }
  proc.on('exit', cleanExit)
  proc.on('error', () => cleanExit(1))

  const removeExitHandler = onExit(code => {
    cleanExit(typeof code === 'number' ? code : 1)
  });

  proc.destroy = async (): Promise<void> => {
    removeExitHandler()
    proc.removeAllListeners('exit')
    proc.removeAllListeners('error')
    return pTreeKill(proc.pid).catch(() => {
      /* ignore error */
    })
  }
  return proc as CustomSpawnD
}

const createServerLogPrefix = () => new stream.Transform({
  transform(chunk, encoding, callback) {
    this.push(chalk.magentaBright(`[Jest Process Manager] ${chunk.toString()}`))
    callback()
  },
})

export class JestProcessManagerError extends Error {
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
    throw new JestProcessManagerError(
      'You must define a `command`',
      ERROR_NO_COMMAND,
    )
  }

  servers[index] = spawnd(config.command, {
    shell: true,
    cwd: cwd(),
    ...config.options,
    env: {
      ...process.env,
      ...(config.options?.env ? config.options.env : {})
    }
  })

  if (config.debug) {
    console.log(chalk.magentaBright('\nJest dev-server output:'))
    servers[index].stdout!.pipe(createServerLogPrefix()).pipe(process.stdout)
  }
}

async function outOfStin<T>(block: () => Promise<T>) {
  const { stdin } = process
  const listeners = stdin.listeners('data')
  const result = await block()
  listeners.forEach(listener => stdin.on('data', listener as (...args: any[]) => void))
  stdin.setRawMode(true)
  stdin.setEncoding('utf8')
  stdin.resume()
  return result
}

async function getIsPortTaken(config: JestProcessManagerOptions) {
  // TODO Make it configurable through config?
  const timeout = 1000
  const {port, host} = config
  const promise = new Promise(((resolve, reject) => {
    const socket = new net.Socket()

    const onError = () => {
      socket.destroy()
      reject()
    };

    socket.setTimeout(timeout);
    socket.once('error', onError)
    socket.once('timeout', onError)

    socket.connect(port, host as string, () => {
      socket.end()
      resolve(true)
    })
  }))

  try {
    await promise
    return true
  } catch (_) {
    return false
  }
}

const basePathUrlPostfix = (basePath?: string): string => {
  if (basePath) {
    return basePath.startsWith('/') ? basePath : `/${basePath}`
  }
  return ''
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
      throw new JestProcessManagerError(
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
    throw new JestProcessManagerError(
      `Invalid \`usedPortAction\`, only ${availableActions} are possible`,
    )
  }

  if (config.port) {
    const { launchTimeout, protocol, host, port, basePath, waitOnScheme } = config
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

    const urlPostfix = basePathUrlPostfix(basePath)

    let url = `${protocol}://${host}:${port}${urlPostfix}`
    if (protocol === 'tcp' || protocol === 'socket') {
      url = `${protocol}:${host}:${port}${urlPostfix}`
    }
    const opts = {
      resources: [url],
      timeout: launchTimeout,
      ...waitOnScheme,
    }

    try {
      await waitOn(opts)
    } catch (err) {
      const [portProcess] = await findProcess('port', config.port)
      if (portProcess) {
        await killProc(portProcess)
      }
      throw new JestProcessManagerError(
        `Server has taken more than ${launchTimeout}ms to start.`,
        ERROR_TIMEOUT,
      )
    }
  } else {
    runServer(config, index)
  }

}

export function getServers(): ChildProcess[] {
  return servers
}

export async function teardown(command?: string): Promise<void> {
  if (servers.length) {
    await Promise.all(servers.map(server => server.destroy()))
  }
  if (command) {
    try {
      await pExec(command);
    } catch (e) {
      console.error(e);
    }
  }
}
