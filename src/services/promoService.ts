import fs from 'node:fs';
import path from 'node:path';
import { PromoTemplate, PromoSelectionMode } from '../types/index.js';

export class PromoService {
  private filePath: string;
  private roundRobinIndex: number = 0;
  private shufflePool: string[] = [];
  private perGroupOffset: number = 0;

  public static readonly AVAILABLE_MODES: Array<{
    mode: PromoSelectionMode;
    name: string;
    alias: string[];
    description: string;
  }> = [
    {
      mode: 'round-robin',
      name: 'Round-Robin (Rotasi Urut Per Siklus)',
      alias: ['rr', 'roundrobin', 'round-robin', 'rotasi', 'urut'],
      description: 'Mengirim 1 template promo yang sama ke semua grup, lalu berganti urut pada siklus berikutnya (1 -> 2 -> 3 -> 1).',
    },
    {
      mode: 'random',
      name: 'Random (Acak Murni Per Siklus)',
      alias: ['rand', 'random', 'acak'],
      description: 'Memilih 1 template promo secara acak murni untuk seluruh grup pada setiap siklus broadcast.',
    },
    {
      mode: 'shuffle',
      name: 'Shuffle (Acak Tanpa Duplikasi Putaran)',
      alias: ['shuffle', 'shuf', 'random-cycle', 'acak-siklus', 'acak-berputar'],
      description: 'Mengacak urutan promo tanpa pengulangan beruntun. Semua promo terkirim 1x sebelum diacak ulang.',
    },
    {
      mode: 'least-sent',
      name: 'Least-Sent (Paling Jarang Terkirim)',
      alias: ['least-sent', 'leastsent', 'least', 'balanced', 'seimbang', 'jarang'],
      description: 'Otomatis memprioritaskan promo yang paling sedikit terkirim di log agar distribusi promo seimbang.',
    },
    {
      mode: 'per-group-round-robin',
      name: 'Per-Group Round-Robin (Rotasi Urut Antar Grup)',
      alias: ['per-group-round-robin', 'group-round-robin', 'pgrr', 'pergroup-rr', 'grup-urut'],
      description: 'Setiap grup menerima promo yang berbeda secara berurutan dalam 1 siklus broadcast yang sama.',
    },
    {
      mode: 'per-group-random',
      name: 'Per-Group Random (Acak Per Grup)',
      alias: ['per-group-random', 'group-random', 'pgrand', 'pergroup-random', 'grup-acak'],
      description: 'Setiap grup menerima promo acak yang dipilih secara independen dalam 1 siklus broadcast.',
    },
    {
      mode: 'per-group-shuffle',
      name: 'Per-Group Shuffle (Acak Merata Antar Grup)',
      alias: ['per-group-shuffle', 'group-shuffle', 'pgshuffle', 'pergroup-shuffle', 'grup-shuffle'],
      description: 'Setiap grup menerima promo acak yang berbeda dalam 1 siklus tanpa ada promo ganda antar grup.',
    },
  ];

  constructor(dataDir: string = './data') {
    this.filePath = path.resolve(dataDir, 'promos.json');
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

  private shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  public normalizeMode(input: string): PromoSelectionMode | null {
    if (!input) return null;
    const clean = input.trim().toLowerCase();
    for (const item of PromoService.AVAILABLE_MODES) {
      if (item.mode === clean || item.alias.includes(clean)) {
        return item.mode;
      }
    }
    return null;
  }

  public formatAvailableModes(): string {
    const list = PromoService.AVAILABLE_MODES.map((item, idx) => {
      const aliases = item.alias.filter((a) => a !== item.mode).join(', ');
      return (
        `*${idx + 1}. ${item.mode}*\n` +
        `   • Nama: _${item.name}_\n` +
        `   • Deskripsi: ${item.description}\n` +
        (aliases ? `   • Alias: \`${aliases}\`\n` : '')
      );
    }).join('\n');

    return (
      `🎯 *PILIHAN MODE PEMILIHAN PROMO:*\n\n` +
      `${list}\n` +
      `💡 _Gunakan perintah \`/setmode <nama_mode>\` untuk mengubah mode aktif._`
    );
  }

  public getAllPromos(): PromoTemplate[] {
    try {
      this.ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (p): p is PromoTemplate =>
          typeof p === 'object' &&
          p !== null &&
          typeof p.id === 'string' &&
          typeof p.text === 'string' &&
          typeof p.enabled === 'boolean'
      );
    } catch (err) {
      console.error(`[ERROR] Failed to read ${this.filePath}:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  public getEnabledPromos(): PromoTemplate[] {
    return this.getAllPromos().filter((p) => p.enabled);
  }

  public getPromoById(id: string): PromoTemplate | undefined {
    const normalized = id.trim().toLowerCase();
    return this.getAllPromos().find((p) => p.id.toLowerCase() === normalized);
  }

  public getNextPromo(
    mode: PromoSelectionMode = 'round-robin',
    sendCounts: Record<string, number> = {}
  ): PromoTemplate | undefined {
    const enabled = this.getEnabledPromos();
    if (enabled.length === 0) return undefined;

    switch (mode) {
      case 'random': {
        const randomIndex = Math.floor(Math.random() * enabled.length);
        return enabled[randomIndex];
      }

      case 'shuffle': {
        const validIds = new Set(enabled.map((p) => p.id));
        this.shufflePool = this.shufflePool.filter((id) => validIds.has(id));

        if (this.shufflePool.length === 0) {
          this.shufflePool = this.shuffleArray(enabled.map((p) => p.id));
        }

        const nextId = this.shufflePool.shift();
        const promo = enabled.find((p) => p.id === nextId);
        return promo || enabled[0];
      }

      case 'least-sent': {
        const sorted = [...enabled].sort((a, b) => {
          const countA = sendCounts[a.id.toLowerCase()] || 0;
          const countB = sendCounts[b.id.toLowerCase()] || 0;
          return countA - countB;
        });
        const minCount = sendCounts[sorted[0].id.toLowerCase()] || 0;
        const candidates = sorted.filter(
          (p) => (sendCounts[p.id.toLowerCase()] || 0) === minCount
        );
        return candidates[Math.floor(Math.random() * candidates.length)];
      }

      case 'round-robin':
      default: {
        const promo = enabled[this.roundRobinIndex % enabled.length];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % enabled.length;
        return promo;
      }
    }
  }

  public generateCyclePromos(
    mode: PromoSelectionMode = 'round-robin',
    groupCount: number,
    sendCounts: Record<string, number> = {}
  ): PromoTemplate[] {
    const enabled = this.getEnabledPromos();
    if (enabled.length === 0 || groupCount <= 0) return [];

    switch (mode) {
      case 'per-group-round-robin': {
        const result: PromoTemplate[] = [];
        for (let i = 0; i < groupCount; i++) {
          const index = (this.perGroupOffset + i) % enabled.length;
          result.push(enabled[index]);
        }
        this.perGroupOffset = (this.perGroupOffset + groupCount) % enabled.length;
        return result;
      }

      case 'per-group-random': {
        const result: PromoTemplate[] = [];
        for (let i = 0; i < groupCount; i++) {
          const randomIndex = Math.floor(Math.random() * enabled.length);
          result.push(enabled[randomIndex]);
        }
        return result;
      }

      case 'per-group-shuffle': {
        const result: PromoTemplate[] = [];
        let pool: PromoTemplate[] = [];
        for (let i = 0; i < groupCount; i++) {
          if (pool.length === 0) {
            pool = this.shuffleArray(enabled);
          }
          const promo = pool.shift()!;
          result.push(promo);
        }
        return result;
      }

      case 'least-sent': {
        const promo = this.getNextPromo('least-sent', sendCounts);
        return promo ? Array(groupCount).fill(promo) : [];
      }

      case 'shuffle': {
        const promo = this.getNextPromo('shuffle', sendCounts);
        return promo ? Array(groupCount).fill(promo) : [];
      }

      case 'random': {
        const promo = this.getNextPromo('random', sendCounts);
        return promo ? Array(groupCount).fill(promo) : [];
      }

      case 'round-robin':
      default: {
        const promo = this.getNextPromo('round-robin', sendCounts);
        return promo ? Array(groupCount).fill(promo) : [];
      }
    }
  }

  public savePromos(promos: PromoTemplate[]): boolean {
    try {
      this.ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify(promos, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error(`[ERROR] Failed to save ${this.filePath}:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  public getPromoByIdOrIndex(identifier: string): PromoTemplate | undefined {
    const cleanId = identifier.trim();
    const promos = this.getAllPromos();

    const index = parseInt(cleanId, 10);
    if (!isNaN(index) && index >= 1 && index <= promos.length) {
      return promos[index - 1];
    }

    return promos.find((p) => p.id.toLowerCase() === cleanId.toLowerCase());
  }

  public addPromo(
    id: string,
    text: string,
    enabled: boolean = true
  ): { success: boolean; promo?: PromoTemplate; isNew: boolean; message: string } {
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const cleanText = text.trim();

    if (!cleanId) {
      return { success: false, isNew: false, message: 'ID promo tidak boleh kosong.' };
    }

    if (!cleanText) {
      return { success: false, isNew: false, message: 'Teks pesan promo tidak boleh kosong.' };
    }

    const promos = this.getAllPromos();
    const existingIndex = promos.findIndex((p) => p.id.toLowerCase() === cleanId);

    if (existingIndex !== -1) {
      promos[existingIndex].text = cleanText;
      promos[existingIndex].enabled = enabled;
      this.savePromos(promos);
      return {
        success: true,
        promo: promos[existingIndex],
        isNew: false,
        message: `Template promo [${cleanId}] berhasil diperbarui.`,
      };
    }

    const newPromo: PromoTemplate = {
      id: cleanId,
      text: cleanText,
      enabled,
    };
    promos.push(newPromo);
    this.savePromos(promos);

    return {
      success: true,
      promo: newPromo,
      isNew: true,
      message: `Template promo baru [${cleanId}] berhasil ditambahkan.`,
    };
  }

  public deletePromo(
    identifier: string
  ): { success: boolean; promo?: PromoTemplate; message: string } {
    const cleanId = identifier.trim();
    const promos = this.getAllPromos();

    const index = parseInt(cleanId, 10);
    let targetIndex = -1;

    if (!isNaN(index) && index >= 1 && index <= promos.length) {
      targetIndex = index - 1;
    } else {
      targetIndex = promos.findIndex((p) => p.id.toLowerCase() === cleanId.toLowerCase());
    }

    if (targetIndex === -1) {
      return {
        success: false,
        message: `Promo "${cleanId}" tidak ditemukan dalam daftar.`,
      };
    }

    const deleted = promos.splice(targetIndex, 1)[0];
    this.savePromos(promos);

    return {
      success: true,
      promo: deleted,
      message: `Promo [${deleted.id}] berhasil dihapus dari data/promos.json.`,
    };
  }

  public setPromoStatus(
    identifier: string | string[],
    enabled: boolean
  ): {
    success: boolean;
    promo?: PromoTemplate;
    totalUpdated?: number;
    affectedPromos?: Array<{ index: number; promo: PromoTemplate }>;
    notFoundTokens?: string[];
    message: string;
  } {
    const promos = this.getAllPromos();
    if (promos.length === 0) {
      return {
        success: false,
        totalUpdated: 0,
        affectedPromos: [],
        notFoundTokens: [],
        message: 'Belum ada template promo yang tersimpan di data/promos.json.',
      };
    }

    const rawInput = Array.isArray(identifier) ? identifier.join(' ').trim() : identifier.trim();

    if (!rawInput) {
      return {
        success: false,
        totalUpdated: 0,
        affectedPromos: [],
        notFoundTokens: [],
        message: 'Harap masukkan nomor urutan, ID promo, rentang (cth: 1-3), atau "all".',
      };
    }

    // 1. Keyword ALL / SEMUA / *
    const lowerInput = rawInput.toLowerCase();
    if (lowerInput === 'all' || lowerInput === 'semua' || rawInput === '*') {
      for (const p of promos) {
        p.enabled = enabled;
      }
      this.savePromos(promos);

      return {
        success: true,
        totalUpdated: promos.length,
        affectedPromos: promos.map((p, idx) => ({ index: idx + 1, promo: p })),
        notFoundTokens: [],
        message: `Status SEMUA promo (${promos.length} template) berhasil diubah menjadi ${
          enabled ? 'ENABLED (Aktif)' : 'DISABLED (Nonaktif)'
        }.`,
      };
    }

    // 2. Direct exact match jika input adalah satu ID promo utuh
    const exactMatchIndex = promos.findIndex((p) => p.id.toLowerCase() === lowerInput);
    if (exactMatchIndex !== -1) {
      promos[exactMatchIndex].enabled = enabled;
      this.savePromos(promos);
      return {
        success: true,
        promo: promos[exactMatchIndex],
        totalUpdated: 1,
        affectedPromos: [{ index: exactMatchIndex + 1, promo: promos[exactMatchIndex] }],
        notFoundTokens: [],
        message: `Status promo [${promos[exactMatchIndex].id}] berhasil diubah menjadi ${
          enabled ? 'ENABLED (Aktif)' : 'DISABLED (Nonaktif)'
        }.`,
      };
    }

    // 3. Multi-token parser (mendukung koma, spasi, rentang 1-3, ID promo)
    const normalized = rawInput.replace(/(\d+)\s*(?:-|–|—|~|\.\.|\bto\b)\s*(\d+)/gi, '$1-$2');
    const tokens = normalized
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const targetIndices = new Set<number>();
    const notFoundTokens: string[] = [];

    for (const token of tokens) {
      // Cek pola rentang angka (misal: 1-3)
      const rangeMatch = token.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        const from = Math.min(start, end);
        const to = Math.max(start, end);

        for (let k = from; k <= to; k++) {
          if (k >= 1 && k <= promos.length) {
            targetIndices.add(k - 1);
          } else {
            notFoundTokens.push(String(k));
          }
        }
        continue;
      }

      // Cek angka tunggal
      if (/^\d+$/.test(token)) {
        const num = parseInt(token, 10);
        if (num >= 1 && num <= promos.length) {
          targetIndices.add(num - 1);
        } else {
          notFoundTokens.push(token);
        }
        continue;
      }

      // Cek ID promo
      const foundIndex = promos.findIndex((p) => p.id.toLowerCase() === token.toLowerCase());
      if (foundIndex !== -1) {
        targetIndices.add(foundIndex);
      } else {
        notFoundTokens.push(token);
      }
    }

    if (targetIndices.size === 0) {
      const notFoundStr = notFoundTokens.length > 0 ? notFoundTokens.join(', ') : rawInput;
      return {
        success: false,
        totalUpdated: 0,
        affectedPromos: [],
        notFoundTokens,
        message: `Promo "${notFoundStr}" tidak ditemukan dalam daftar (total: ${promos.length} template).`,
      };
    }

    const affectedPromos: Array<{ index: number; promo: PromoTemplate }> = [];
    const sortedIndices = Array.from(targetIndices).sort((a, b) => a - b);

    for (const idx of sortedIndices) {
      promos[idx].enabled = enabled;
      affectedPromos.push({ index: idx + 1, promo: promos[idx] });
    }

    this.savePromos(promos);

    const statusStr = enabled ? 'ENABLED (Aktif)' : 'DISABLED (Nonaktif)';
    let msg = '';

    if (affectedPromos.length === 1) {
      msg = `Status promo [${affectedPromos[0].promo.id}] berhasil diubah menjadi ${statusStr}.`;
    } else {
      const promoLines = affectedPromos
        .map((item) => `• *${item.index}. ID: [${item.promo.id}]*`)
        .join('\n');
      msg = `Berhasil mengubah status ${affectedPromos.length} template promo menjadi ${statusStr}:\n\n${promoLines}`;
    }

    if (notFoundTokens.length > 0) {
      msg += `\n\n⚠️ Catatan: ${notFoundTokens.length} target tidak ditemukan: ${notFoundTokens.join(', ')}`;
    }

    return {
      success: true,
      promo: affectedPromos[0]?.promo,
      totalUpdated: affectedPromos.length,
      affectedPromos,
      notFoundTokens,
      message: msg,
    };
  }

  public formatPromoDetail(identifier: string): string {
    const promo = this.getPromoByIdOrIndex(identifier);
    if (!promo) {
      return `Promo "${identifier}" tidak ditemukan.`;
    }

    return (
      `📌 ID Promo : [${promo.id}]\n` +
      `Status   : ${promo.enabled ? '🟢 enabled (aktif)' : '🔴 disabled (nonaktif)'}\n` +
      `----------------------------------------\n` +
      `${promo.text}\n` +
      `----------------------------------------`
    );
  }

  public formatPromoList(): string {
    const promos = this.getAllPromos();
    if (promos.length === 0) {
      return (
        'Belum ada template promo yang terdaftar di data/promos.json.\n' +
        'Ketik "addpromo" di terminal atau edit file data/promos.json untuk menambahkan teks promo.'
      );
    }

    return promos
      .map((p, index) => {
        const preview = p.text.length > 80 ? p.text.substring(0, 80) + '...' : p.text;
        const formattedPreview = preview.replace(/\n/g, ' ');
        return `${index + 1}. ID: [${p.id}]\n   Status: ${
          p.enabled ? '🟢 enabled' : '🔴 disabled'
        }\n   Preview: "${formattedPreview}"`;
      })
      .join('\n\n');
  }
}

export const promoService = new PromoService(process.env.DATA_DIR || './data');
