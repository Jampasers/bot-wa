import fs from 'node:fs';
import path from 'node:path';
import { BotConfig, BotStatus, LogEntry } from '../types/index.js';
import { groupService, GroupService } from '../services/groupService.js';
import { promoService, PromoService } from '../services/promoService.js';
import { logService, LogService } from '../services/logService.js';
import type { WhatsAppClient } from '../whatsapp/client.js';

export class PromoScheduler {
  private configPath: string;
  private timer: NodeJS.Timeout | null = null;
  private isRunningState: boolean = false;
  private isExecuting: boolean = false;
  private lastSendTime: Date | null = null;
  private nextScheduleTime: Date | null = null;
  private client: WhatsAppClient | null = null;

  constructor(
    private groups: GroupService = groupService,
    private promos: PromoService = promoService,
    private logs: LogService = logService,
    client: WhatsAppClient | null = null,
    dataDir: string = './data'
  ) {
    this.client = client;
    this.configPath = path.resolve(dataDir, 'config.json');
    this.ensureConfigExists();
  }

  public setClient(client: WhatsAppClient): void {
    this.client = client;
  }

  public getClient(): WhatsAppClient | null {
    return this.client;
  }

  private ensureConfigExists(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.configPath)) {
      const defaultConfig: BotConfig = {
        intervalMinutes: {
          min: 30,
          max: 60,
        },
        randomDelaySeconds: {
          min: 10,
          max: 30,
        },
        promoSelectionMode: 'round-robin',
      };
      fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    }
  }

  public getConfig(): BotConfig {
    try {
      this.ensureConfigExists();
      const raw = fs.readFileSync(this.configPath, 'utf-8').trim();
      if (!raw) throw new Error('Config file is empty');
      const parsed = JSON.parse(raw);

      let intervalMinutes: BotConfig['intervalMinutes'] = 60;
      if (typeof parsed.intervalMinutes === 'number') {
        intervalMinutes = Math.max(1, Number(parsed.intervalMinutes) || 60);
      } else if (parsed.intervalMinutes && typeof parsed.intervalMinutes === 'object') {
        const min = Math.max(1, Number(parsed.intervalMinutes.min) || 60);
        const max = Math.max(min, Number(parsed.intervalMinutes.max) || min);
        intervalMinutes = min === max ? min : { min, max };
      }

      let randomDelaySeconds = { min: 10, max: 30 };
      if (typeof parsed.randomDelaySeconds === 'number') {
        const val = Math.max(1, Number(parsed.randomDelaySeconds) || 10);
        randomDelaySeconds = { min: val, max: val };
      } else if (parsed.randomDelaySeconds && typeof parsed.randomDelaySeconds === 'object') {
        const min = Math.max(1, Number(parsed.randomDelaySeconds.min) || 10);
        const max = Math.max(min, Number(parsed.randomDelaySeconds.max) || 30);
        randomDelaySeconds = { min, max };
      }

      return {
        intervalMinutes,
        randomDelaySeconds,
        promoSelectionMode: this.promos.normalizeMode(parsed.promoSelectionMode) || 'round-robin',
      };
    } catch (err) {
      this.logs.logError('Gagal membaca config.json, menggunakan konfigurasi default', String(err));
      return {
        intervalMinutes: { min: 30, max: 60 },
        randomDelaySeconds: { min: 10, max: 30 },
        promoSelectionMode: 'round-robin',
      };
    }
  }

  public saveConfig(config: BotConfig): boolean {
    try {
      this.ensureConfigExists();
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (err) {
      this.logs.logError('Gagal menyimpan config.json:', err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  public getNextIntervalMinutes(): number {
    const config = this.getConfig();
    const interval = config.intervalMinutes;
    if (typeof interval === 'number') {
      return interval;
    }
    return this.getRandomDelay(interval.min, interval.max);
  }

  public formatIntervalText(interval?: BotConfig['intervalMinutes']): string {
    const conf = interval !== undefined ? interval : this.getConfig().intervalMinutes;
    if (typeof conf === 'number') {
      return `${conf} menit`;
    }
    if (conf.min === conf.max) {
      return `${conf.min} menit`;
    }
    return `${conf.min} - ${conf.max} menit (acak)`;
  }

  public formatDelayText(delay?: BotConfig['randomDelaySeconds']): string {
    const conf = delay !== undefined ? delay : this.getConfig().randomDelaySeconds;
    if (conf.min === conf.max) {
      return `${conf.min} detik`;
    }
    return `${conf.min} - ${conf.max} detik (acak)`;
  }

  public setIntervalMinutes(
    min: number,
    max?: number
  ): { success: boolean; message: string; config: BotConfig } {
    if (isNaN(min) || min < 1) {
      return {
        success: false,
        message: 'Nilai interval minimal harus berupa angka minimal 1 menit.',
        config: this.getConfig(),
      };
    }

    const minVal = Math.max(1, Math.round(min));
    const maxVal = max !== undefined && !isNaN(max) ? Math.max(minVal, Math.round(max)) : minVal;

    const current = this.getConfig();
    current.intervalMinutes = minVal === maxVal ? minVal : { min: minVal, max: maxVal };
    this.saveConfig(current);

    const intervalText = this.formatIntervalText(current.intervalMinutes);
    this.logs.logInfo(`Interval siklus promosi diubah menjadi: ${intervalText}`);

    // If scheduler is active and not currently sending, reschedule next cycle
    if (this.isRunningState && !this.isExecuting) {
      const nextDelayMs = this.getNextIntervalMinutes() * 60 * 1000;
      this.scheduleNextRun(nextDelayMs);
    }

    return {
      success: true,
      message: `Interval promosi berhasil diatur ke: *${intervalText}*.`,
      config: current,
    };
  }

  public setDelaySeconds(
    min: number,
    max?: number
  ): { success: boolean; message: string; config: BotConfig } {
    if (isNaN(min) || min < 1) {
      return {
        success: false,
        message: 'Nilai delay minimal harus berupa angka minimal 1 detik.',
        config: this.getConfig(),
      };
    }

    const minVal = Math.max(1, Math.round(min));
    const maxVal = max !== undefined && !isNaN(max) ? Math.max(minVal, Math.round(max)) : minVal;

    const current = this.getConfig();
    current.randomDelaySeconds = { min: minVal, max: maxVal };
    this.saveConfig(current);

    const delayText = this.formatDelayText(current.randomDelaySeconds);
    this.logs.logInfo(`Delay antar grup diubah menjadi: ${delayText}`);

    return {
      success: true,
      message: `Delay jeda antar grup berhasil diatur ke: *${delayText}*.`,
      config: current,
    };
  }

  public setPromoSelectionMode(
    modeInput: string
  ): { success: boolean; message: string; mode?: BotConfig['promoSelectionMode'] } {
    const normalized = this.promos.normalizeMode(modeInput);
    if (!normalized) {
      return {
        success: false,
        message: `Mode "${modeInput}" tidak valid.\n\nKetik */modes* atau *modes* untuk melihat daftar mode yang tersedia.`,
      };
    }

    const current = this.getConfig();
    current.promoSelectionMode = normalized;
    this.saveConfig(current);

    const modeInfo = PromoService.AVAILABLE_MODES.find((m) => m.mode === normalized);
    const modeName = modeInfo ? modeInfo.name : normalized;

    this.logs.logInfo(`Mode pemilihan promo diubah menjadi: ${normalized} (${modeName})`);

    return {
      success: true,
      message: `Mode pemilihan promo berhasil diubah menjadi: *${normalized}* (${modeName}).`,
      mode: normalized,
    };
  }

  public start(): { success: boolean; message: string } {
    if (this.isRunningState) {
      return { success: false, message: 'Scheduler sudah berjalan.' };
    }

    const config = this.getConfig();
    this.isRunningState = true;

    this.logs.logInfo(
      `Scheduler diaktifkan. Interval: setiap ${this.formatIntervalText(config.intervalMinutes)}. Delay antar grup: ${this.formatDelayText(config.randomDelaySeconds)}. Mode promo: ${config.promoSelectionMode || 'round-robin'}.`
    );

    // Schedule next run
    const nextIntervalMinutes = this.getNextIntervalMinutes();
    this.scheduleNextRun(nextIntervalMinutes * 60 * 1000);

    // Immediately trigger the first round if client is connected
    this.runPromoCycle().catch((err) => {
      this.logs.logError('Kesalahan saat menjalankan siklus promo', err.message);
    });

    return { success: true, message: 'Scheduler berhasil dimulai.' };
  }

  public stop(): { success: boolean; message: string } {
    if (!this.isRunningState) {
      return { success: false, message: 'Scheduler memang sedang tidak aktif.' };
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.isRunningState = false;
    this.nextScheduleTime = null;
    this.logs.logInfo('Scheduler dihentikan.');
    return { success: true, message: 'Scheduler berhasil dihentikan.' };
  }

  public isRunning(): boolean {
    return this.isRunningState;
  }

  private scheduleNextRun(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.nextScheduleTime = new Date(Date.now() + delayMs);

    this.timer = setTimeout(async () => {
      if (!this.isRunningState) return;

      await this.runPromoCycle();

      if (this.isRunningState) {
        const nextDelayMs = this.getNextIntervalMinutes() * 60 * 1000;
        this.scheduleNextRun(nextDelayMs);
      }
    }, delayMs);
  }

  private getRandomDelay(minSec: number, maxSec: number): number {
    const min = Math.ceil(minSec);
    const max = Math.floor(maxSec);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async runPromoCycle(): Promise<void> {
    if (this.isExecuting) {
      this.logs.logInfo('Siklus sebelumnya masih berjalan. Melewati putaran ini.');
      return;
    }

    if (!this.client || !this.client.isConnected()) {
      this.logs.logInfo('WhatsApp belum terhubung. Menunggu koneksi WhatsApp sebelum mengirim promo...');
      return;
    }

    const enabledGroups = this.groups.getEnabledGroups();
    if (enabledGroups.length === 0) {
      this.logs.logInfo('Tidak ada grup yang aktif (enabled: true) di data/groups.json.');
      return;
    }

    const config = this.getConfig();
    const mode = config.promoSelectionMode || 'round-robin';
    const sendCounts = this.logs.getPromoSendCounts();

    const cyclePromos = this.promos.generateCyclePromos(mode, enabledGroups.length, sendCounts);
    if (cyclePromos.length === 0) {
      this.logs.logInfo('Tidak ada promo yang aktif (enabled: true) di data/promos.json.');
      return;
    }

    this.isExecuting = true;
    const isPerGroup = mode.startsWith('per-group-');
    if (isPerGroup) {
      this.logs.logInfo(
        `Memulai pengiriman otomatis [mode: ${mode}] ke ${enabledGroups.length} grup aktif (promo berbeda per grup)...`
      );
    } else {
      this.logs.logInfo(
        `Memulai pengiriman otomatis [mode: ${mode} | promo: ${cyclePromos[0]?.id}] ke ${enabledGroups.length} grup aktif...`
      );
    }

    try {
      for (let i = 0; i < enabledGroups.length; i++) {
        if (!this.isRunningState) {
          this.logs.logInfo('Scheduler dihentikan di tengah siklus pengiriman.');
          break;
        }

        const group = enabledGroups[i];
        const promo = cyclePromos[i] || cyclePromos[0];
        this.logs.logInfo(`Sending [${promo.id}] -> ${group.name}`);

        const result = await this.client.sendTextMessage(group.jid, promo.text);
        const timestamp = new Date().toISOString();

        if (result.success) {
          this.logs.logSuccess(`Message sent [${promo.id}] -> ${group.name}`);
          const logEntry: LogEntry = {
            timestamp,
            groupJid: group.jid,
            groupName: group.name,
            promoId: promo.id,
            status: 'SUCCESS',
          };
          this.logs.logPromoDelivery(logEntry);
        } else {
          this.logs.logError(`Failed sending [${promo.id}] -> ${group.name}`, result.error);
          const logEntry: LogEntry = {
            timestamp,
            groupJid: group.jid,
            groupName: group.name,
            promoId: promo.id,
            status: 'FAILED',
            error: result.error,
          };
          this.logs.logPromoDelivery(logEntry);
        }

        this.lastSendTime = new Date();

        // Delay between groups if there are more groups remaining
        if (i < enabledGroups.length - 1 && this.isRunningState) {
          const delaySec = this.getRandomDelay(
            config.randomDelaySeconds.min,
            config.randomDelaySeconds.max
          );
          this.logs.logInfo(`Menunggu jeda aman selama ${delaySec} detik sebelum grup berikutnya...`);
          await this.sleep(delaySec * 1000);
        }
      }

      this.logs.logInfo('Siklus pengiriman promo selesai.');
    } catch (err) {
      this.logs.logError('Error tidak terduga saat pengiriman:', err instanceof Error ? err.message : String(err));
    } finally {
      this.isExecuting = false;
    }
  }

  public async sendManual(
    groupJid: string,
    promoId: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.client || !this.client.isConnected()) {
      const waStatus = this.client ? this.client.getStatus() : 'DISCONNECTED';
      return {
        success: false,
        message: `WhatsApp belum terhubung (Status: ${waStatus}).`,
      };
    }

    const group = this.groups.getGroupByJid(groupJid);
    if (!group) {
      return {
        success: false,
        message: `Grup dengan JID "${groupJid}" tidak ditemukan di data/groups.json.`,
      };
    }

    if (!group.enabled) {
      return {
        success: false,
        message: `Grup "${group.name}" memiliki status disabled (enabled: false).`,
      };
    }

    const promo = this.promos.getPromoById(promoId);
    if (!promo) {
      return {
        success: false,
        message: `Promo dengan ID "${promoId}" tidak ditemukan di data/promos.json.`,
      };
    }

    if (!promo.enabled) {
      return {
        success: false,
        message: `Promo [${promo.id}] memiliki status disabled (enabled: false).`,
      };
    }

    this.logs.logInfo(`[MANUAL] Sending ${promo.id} -> ${group.name}`);
    const result = await this.client.sendTextMessage(group.jid, promo.text);
    const timestamp = new Date().toISOString();

    if (result.success) {
      this.logs.logSuccess(`[MANUAL] Message sent -> ${group.name}`);
      this.logs.logPromoDelivery({
        timestamp,
        groupJid: group.jid,
        groupName: group.name,
        promoId: promo.id,
        status: 'SUCCESS',
      });
      this.lastSendTime = new Date();
      return { success: true, message: `Berhasil mengirim promo [${promo.id}] ke "${group.name}".` };
    } else {
      this.logs.logError(`[MANUAL] Failed sending -> ${group.name}`, result.error);
      this.logs.logPromoDelivery({
        timestamp,
        groupJid: group.jid,
        groupName: group.name,
        promoId: promo.id,
        status: 'FAILED',
        error: result.error,
      });
      return {
        success: false,
        message: `Gagal mengirim ke "${group.name}": ${result.error}`,
      };
    }
  }

  public getStatus(): BotStatus {
    const config = this.getConfig();
    const allGroups = this.groups.getAllGroups();
    const enabledGroups = this.groups.getEnabledGroups();
    const allPromos = this.promos.getAllPromos();
    const enabledPromos = this.promos.getEnabledPromos();
    const waStatus = this.client ? this.client.getStatus() : 'DISCONNECTED';

    return {
      waStatus,
      schedulerActive: this.isRunningState,
      isExecutingTask: this.isExecuting,
      activeGroupsCount: enabledGroups.length,
      totalGroupsCount: allGroups.length,
      activePromosCount: enabledPromos.length,
      totalPromosCount: allPromos.length,
      lastSendTime: this.lastSendTime ? this.lastSendTime.toLocaleString('id-ID') : 'Belum pernah',
      nextScheduleTime: this.nextScheduleTime
        ? this.nextScheduleTime.toLocaleString('id-ID')
        : 'Tidak dijadwalkan',
      intervalMinutes: this.formatIntervalText(config.intervalMinutes),
      delaySeconds: this.formatDelayText(config.randomDelaySeconds),
      promoSelectionMode: config.promoSelectionMode || 'round-robin',
    };
  }
}

export const promoScheduler = new PromoScheduler();
