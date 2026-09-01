import fs from 'node:fs';
import path from 'node:path';
import { GroupConfig } from '../types/index.js';

export class GroupService {
  private filePath: string;

  constructor(dataDir: string = './data') {
    this.filePath = path.resolve(dataDir, 'groups.json');
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

  public getAllGroups(): GroupConfig[] {
    try {
      this.ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8').trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (g): g is GroupConfig =>
          typeof g === 'object' &&
          g !== null &&
          typeof g.jid === 'string' &&
          typeof g.name === 'string' &&
          typeof g.enabled === 'boolean'
      );
    } catch (err) {
      console.error(`[ERROR] Failed to read ${this.filePath}:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  public getEnabledGroups(): GroupConfig[] {
    return this.getAllGroups().filter((g) => g.enabled);
  }

  public getGroupByJid(jid: string): GroupConfig | undefined {
    const normalized = jid.trim();
    return this.getAllGroups().find((g) => g.jid.toLowerCase() === normalized.toLowerCase());
  }

  public isValidGroupJid(jid: string): boolean {
    if (!jid || typeof jid !== 'string') return false;
    const cleanJid = jid.trim();
    return cleanJid.endsWith('@g.us') || cleanJid.endsWith('@s.whatsapp.net');
  }

  public saveGroups(groups: GroupConfig[]): boolean {
    try {
      this.ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify(groups, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error(`[ERROR] Failed to save ${this.filePath}:`, err instanceof Error ? err.message : err);
      return false;
    }
  }

  public syncWithWhatsApp(fetchedGroups: Array<{ jid: string; name: string }>): {
    added: number;
    updated: number;
    total: number;
    groups: GroupConfig[];
  } {
    // Exclude dummy template entries (dummy JIDs matching template patterns)
    const currentGroups = this.getAllGroups().filter(
      (g) => !g.jid.startsWith('12036300000000000')
    );

    const currentMap = new Map<string, GroupConfig>();
    for (const g of currentGroups) {
      currentMap.set(g.jid.toLowerCase(), g);
    }

    let added = 0;
    let updated = 0;
    const newGroupList: GroupConfig[] = [];

    for (const fetched of fetchedGroups) {
      const jidLower = fetched.jid.toLowerCase();
      const existing = currentMap.get(jidLower);

      if (existing) {
        if (existing.name !== fetched.name) {
          updated++;
        }
        newGroupList.push({
          jid: fetched.jid,
          name: fetched.name,
          enabled: existing.enabled, // preserve user's toggle setting
        });
      } else {
        added++;
        newGroupList.push({
          jid: fetched.jid,
          name: fetched.name,
          enabled: false, // real discovered groups default to disabled
        });
      }
    }

    this.saveGroups(newGroupList);

    return {
      added,
      updated,
      total: newGroupList.length,
      groups: newGroupList,
    };
  }

  public setGroupStatus(
    identifier: string | string[],
    enabled: boolean
  ): {
    success: boolean;
    group?: GroupConfig;
    totalUpdated?: number;
    affectedGroups?: Array<{ index: number; group: GroupConfig }>;
    notFoundTokens?: string[];
    message: string;
  } {
    const groups = this.getAllGroups();
    if (groups.length === 0) {
      return {
        success: false,
        message: 'Belum ada grup yang tersimpan di data/groups.json.',
        totalUpdated: 0,
        affectedGroups: [],
        notFoundTokens: [],
      };
    }

    const rawInput = Array.isArray(identifier) ? identifier.join(' ').trim() : identifier.trim();

    if (!rawInput) {
      return {
        success: false,
        message: 'Harap masukkan nomor urutan, rentang (cth: 1-5), JID grup, atau "all".',
        totalUpdated: 0,
        affectedGroups: [],
        notFoundTokens: [],
      };
    }

    // 1. Keyword ALL / SEMUA / *
    const lowerInput = rawInput.toLowerCase();
    if (lowerInput === 'all' || lowerInput === 'semua' || rawInput === '*') {
      for (const g of groups) {
        g.enabled = enabled;
      }
      this.saveGroups(groups);

      return {
        success: true,
        totalUpdated: groups.length,
        affectedGroups: groups.map((g, idx) => ({ index: idx + 1, group: g })),
        notFoundTokens: [],
        message: `Status SEMUA grup (${groups.length} grup) berhasil diubah menjadi ${
          enabled ? 'ENABLED (Aktif)' : 'DISABLED (Nonaktif)'
        }.`,
      };
    }

    // 2. Direct match jika input adalah satu nama grup utuh atau satu JID utuh
    const exactMatchIndex = groups.findIndex(
      (g) =>
        g.jid.toLowerCase() === lowerInput ||
        g.name.toLowerCase() === lowerInput
    );

    if (exactMatchIndex !== -1) {
      groups[exactMatchIndex].enabled = enabled;
      this.saveGroups(groups);
      return {
        success: true,
        group: groups[exactMatchIndex],
        totalUpdated: 1,
        affectedGroups: [{ index: exactMatchIndex + 1, group: groups[exactMatchIndex] }],
        notFoundTokens: [],
        message: `Status grup "${groups[exactMatchIndex].name}" berhasil diubah menjadi ${
          enabled ? 'ENABLED (Aktif)' : 'DISABLED (Nonaktif)'
        }.`,
      };
    }

    // 3. Parser multi-token (mendukung koma, spasi, rentang angka 1-5, 1..5, 1 to 5, nomor index, dan JID)
    const normalized = rawInput.replace(/(\d+)\s*(?:-|–|—|~|\.\.|\bto\b)\s*(\d+)/gi, '$1-$2');
    const tokens = normalized
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const targetIndices = new Set<number>();
    const notFoundTokens: string[] = [];

    for (const token of tokens) {
      // Cek pola rentang angka (misal: 1-5)
      const rangeMatch = token.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        const from = Math.min(start, end);
        const to = Math.max(start, end);

        let anyMatched = false;
        for (let k = from; k <= to; k++) {
          if (k >= 1 && k <= groups.length) {
            targetIndices.add(k - 1);
            anyMatched = true;
          } else {
            notFoundTokens.push(String(k));
          }
        }
        continue;
      }

      // Cek angka tunggal
      if (/^\d+$/.test(token)) {
        const num = parseInt(token, 10);
        if (num >= 1 && num <= groups.length) {
          targetIndices.add(num - 1);
        } else {
          notFoundTokens.push(token);
        }
        continue;
      }

      // Cek JID atau kecocokan nama grup
      const foundIndex = groups.findIndex(
        (g) =>
          g.jid.toLowerCase() === token.toLowerCase() ||
          g.name.toLowerCase() === token.toLowerCase()
      );

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
        affectedGroups: [],
        notFoundTokens,
        message: `Grup "${notFoundStr}" tidak ditemukan dalam daftar grup terdaftar (total: ${groups.length} grup).`,
      };
    }

    const affectedGroups: Array<{ index: number; group: GroupConfig }> = [];
    const sortedIndices = Array.from(targetIndices).sort((a, b) => a - b);

    for (const idx of sortedIndices) {
      groups[idx].enabled = enabled;
      affectedGroups.push({ index: idx + 1, group: groups[idx] });
    }

    this.saveGroups(groups);

    const statusStr = enabled ? 'ENABLED (Aktif)' : 'DISABLED (Nonaktif)';
    let msg = '';

    if (affectedGroups.length === 1) {
      msg = `Status grup "${affectedGroups[0].group.name}" berhasil diubah menjadi ${statusStr}.`;
    } else {
      const groupLines = affectedGroups
        .map((item) => `• *${item.index}. ${item.group.name}*`)
        .join('\n');
      msg = `Berhasil mengubah status ${affectedGroups.length} grup menjadi ${statusStr}:\n\n${groupLines}`;
    }

    if (notFoundTokens.length > 0) {
      msg += `\n\n⚠️ Catatan: ${notFoundTokens.length} target tidak ditemukan: ${notFoundTokens.join(', ')}`;
    }

    return {
      success: true,
      group: affectedGroups[0]?.group,
      totalUpdated: affectedGroups.length,
      affectedGroups,
      notFoundTokens,
      message: msg,
    };
  }

  public formatGroupList(): string {
    const groups = this.getAllGroups();
    if (groups.length === 0) {
      return 'Belum ada grup yang terdaftar.\nKetik "scangroups" untuk memindai semua grup WhatsApp Anda.';
    }

    return groups
      .map(
        (g, index) =>
          `${index + 1}. ${g.name}\n   JID: ${g.jid}\n   Status: ${
            g.enabled ? '🟢 enabled' : '🔴 disabled'
          }`
      )
      .join('\n\n');
  }
}

export const groupService = new GroupService(process.env.DATA_DIR || './data');
