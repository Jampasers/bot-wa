import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  isJidStatusBroadcast,
  isJidNewsletter,
  type WASocket,
  type CacheStore,
} from '@whiskeysockets/baileys';
import NodeCache from '@cacheable/node-cache';
import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { WhatsAppConnectionStatus } from '../types/index.js';
import { logService } from '../services/logService.js';
import { setupConnectionEvents } from './events.js';

export class WhatsAppClient {
  private socket: WASocket | null = null;
  private authDir: string;
  private status: WhatsAppConnectionStatus = 'DISCONNECTED';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private msgRetryCache: CacheStore;

  constructor(authDir: string = './auth') {
    this.authDir = path.resolve(authDir);
    this.ensureAuthDir();
    this.msgRetryCache = new NodeCache({
      stdTTL: 3600,
      useClones: false,
    }) as unknown as CacheStore;
  }

  private ensureAuthDir(): void {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  public getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  public setStatus(status: WhatsAppConnectionStatus): void {
    this.status = status;
  }

  public isConnected(): boolean {
    return this.status === 'CONNECTED' && this.socket !== null;
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;
    this.status = 'CONNECTING';

    try {
      this.ensureAuthDir();
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({
        version: [2, 3000, 1015901307] as [number, number, number],
      }));

      const logger = pino({
        level: process.env.LOG_LEVEL || 'silent',
      });

      this.socket = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['WhatsApp Auto Promo Bot', 'Desktop', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: (jid: string) => {
          if (!jid) return true;
          return isJidStatusBroadcast(jid) || isJidNewsletter(jid) || jid.endsWith('@broadcast') || jid.endsWith('@newsletter');
        },
        msgRetryCounterCache: this.msgRetryCache,
        getMessage: async () => undefined,
        generateHighQualityLinkPreview: false,
      });

      setupConnectionEvents(this.socket, this, saveCreds);
    } catch (err) {
      logService.logError(
        'Gagal menginisialisasi WhatsApp client',
        err instanceof Error ? err.message : String(err)
      );
      this.status = 'DISCONNECTED';
      this.scheduleReconnect(10000);
    } finally {
      this.isConnecting = false;
    }
  }

  public scheduleReconnect(delayMs: number = 5000): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      logService.logInfo('Memulai proses rekoneksi WhatsApp...');
      await this.connect();
    }, delayMs);
  }

  public handleLoggedOut(): void {
    try {
      if (fs.existsSync(this.authDir)) {
        const files = fs.readdirSync(this.authDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.authDir, file));
        }
      }
      logService.logInfo('Folder autentikasi telah dibersihkan. Mempersiapkan QR code baru...');
    } catch (err) {
      logService.logError(
        'Gagal membersihkan folder auth:',
        err instanceof Error ? err.message : String(err)
      );
    }
    this.scheduleReconnect(3000);
  }

  public async sendTextMessage(
    jid: string,
    text: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected() || !this.socket) {
      return {
        success: false,
        error: 'WhatsApp belum terhubung (Status: ' + this.status + ')',
      };
    }

    try {
      await this.socket.sendMessage(jid, { text });
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMsg };
    }
  }

  public async fetchParticipatingGroups(): Promise<Array<{ jid: string; name: string }>> {
    if (!this.isConnected() || !this.socket) {
      throw new Error('WhatsApp belum terhubung (Status: ' + this.status + ')');
    }

    try {
      const groupsRecord = await this.socket.groupFetchAllParticipating();
      const groupList = Object.values(groupsRecord).map((g) => ({
        jid: g.id,
        name: (g.subject && g.subject.trim().length > 0) ? g.subject.trim() : 'Tanpa Nama',
      }));
      return groupList;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Gagal memindai grup dari WhatsApp: ${errorMsg}`);
    }
  }

  public getSocket(): WASocket | null {
    return this.socket;
  }

  public async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch {
        // ignore on clean close
      }
      this.socket = null;
    }
    this.status = 'DISCONNECTED';
  }
}

export const waClient = new WhatsAppClient(process.env.AUTH_DIR || './auth');
