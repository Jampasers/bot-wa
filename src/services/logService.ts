import fs from 'node:fs';
import path from 'node:path';
import { LogEntry } from '../types/index.js';

export class LogService {
  private filePath: string;
  private maxStoredLogs: number = 1000;

  constructor(dataDir: string = './data') {
    this.filePath = path.resolve(dataDir, 'logs.json');
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  private getTimeString(): string {
    const now = new Date();
    return now.toTimeString().split(' ')[0]; // HH:MM:SS
  }

  public logInfo(message: string): void {
    console.log(`[${this.getTimeString()}] [INFO] ${message}`);
  }

  public logSuccess(message: string): void {
    console.log(`[${this.getTimeString()}] [SUCCESS] ${message}`);
  }

  public logError(message: string, reason?: string): void {
    console.error(`[${this.getTimeString()}] [ERROR] ${message}`);
    if (reason) {
      console.error(`Reason: ${reason}`);
    }
  }

  public logPromoDelivery(entry: LogEntry): void {
    try {
      this.ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
      let logs: LogEntry[] = [];
      if (raw) {
        try {
          logs = JSON.parse(raw);
          if (!Array.isArray(logs)) logs = [];
        } catch {
          logs = [];
        }
      }

      logs.push(entry);

      // Keep recent logs to prevent file from growing indefinitely
      if (logs.length > this.maxStoredLogs) {
        logs = logs.slice(logs.length - this.maxStoredLogs);
      }

      fs.writeFileSync(this.filePath, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[ERROR] Failed to write log to ${this.filePath}:`, err instanceof Error ? err.message : err);
    }
  }

  public getRecentLogs(limit: number = 50): LogEntry[] {
    try {
      this.ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
      if (!raw) return [];
      const logs = JSON.parse(raw);
      if (!Array.isArray(logs)) return [];
      return logs.slice(-limit);
    } catch {
      return [];
    }
  }

  public getPromoSendCounts(): Record<string, number> {
    try {
      this.ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
      if (!raw) return {};
      const logs = JSON.parse(raw);
      if (!Array.isArray(logs)) return {};
      const counts: Record<string, number> = {};
      for (const entry of logs) {
        if (entry && typeof entry.promoId === 'string' && entry.status === 'SUCCESS') {
          const id = entry.promoId.toLowerCase();
          counts[id] = (counts[id] || 0) + 1;
        }
      }
      return counts;
    } catch {
      return {};
    }
  }
}

export const logService = new LogService(process.env.DATA_DIR || './data');
