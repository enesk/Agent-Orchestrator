import winston from 'winston';
import { LogEntry } from '../shared/types';
declare const logger: winston.Logger;
export declare function setLogCallback(cb: (entry: LogEntry) => void): void;
export declare function getLogEntries(): LogEntry[];
export declare function log(level: LogEntry['level'], message: string, sessionId?: string): void;
export default logger;
//# sourceMappingURL=Logger.d.ts.map