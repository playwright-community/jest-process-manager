/// <reference types="node" />
import { ChildProcess, SpawnOptions } from "child_process";
import { WaitOnOptions } from "wait-on";

export interface CustomSpawnD extends ChildProcess {
    destroy: () => Promise<void>;
}

export interface JestProcessManagerOptions {
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
    protocol?: 'https' | 'https-get' | 'http' | 'http-get' | 'tcp' | 'socket';
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
     * Option for a basePath where server is running
     *
     * ```js
     * module.exports = {
     *   command: 'npm run start',
     *   basePath: '/myservice',
     * }
     * ```
     */
    basePath?: string;
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
     * jest-process-manager uses the wait-on npm package to wait for resources to become available before calling callback.
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
    options?: SpawnOptions;
}

export declare class JestProcessManagerError extends Error {
    code?: string;
    constructor(message: string, code?: string);
}
export declare function setup(providedConfigs: JestProcessManagerOptions | JestProcessManagerOptions[]): Promise<void>;
export declare function getServers(): ChildProcess[];
export declare function teardown(command?: string): Promise<void>;

export declare const ERROR_TIMEOUT = "ERROR_TIMEOUT";
export declare const ERROR_PORT_USED = "ERROR_PORT_USED";
export declare const ERROR_NO_COMMAND = "ERROR_NO_COMMAND";
