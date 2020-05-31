import { JestProcessManagerOptions } from './types';

export const ERROR_TIMEOUT = 'ERROR_TIMEOUT'
export const ERROR_PORT_USED = 'ERROR_PORT_USED'
export const ERROR_NO_COMMAND = 'ERROR_NO_COMMAND'

export const DEFAULT_CONFIG: JestProcessManagerOptions = {
    command: 'npm run start',
    debug: false,
    options: {},
    launchTimeout: 5000,
    host: 'localhost',
    port: 3000,
    protocol: 'tcp',
    usedPortAction: 'ask',
    waitOnScheme: {},
}
