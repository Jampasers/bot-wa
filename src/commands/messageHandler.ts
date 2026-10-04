import { proto, type WASocket } from '@whiskeysockets/baileys';
import { groupService } from '../services/groupService.js';
import { promoService } from '../services/promoService.js';
import { logService } from '../services/logService.js';
import { promoScheduler } from '../scheduler/scheduler.js';

type ExtendedMessageKey = proto.IMessageKey & {
  senderPn?: string | null;
  participantPn?: string | null;
  remoteJidAlt?: string | null;
  participantAlt?: string | null;
};

export class MessageHandler {
  private normalizeNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('08')) {
      cleaned = '628' + cleaned.substring(2);
    }
    return cleaned;
  }

  public getAdminNumbers(): string[] {
    const raw = process.env.ADMIN_NUMBERS || '';
    return raw
      .split(',')
      .map((num) => this.normalizeNumber(num.trim()))
      .filter((num) => num.length > 0);
  }

  private normalizeJidNumber(jidOrNumber: string): string {
    const userPart = jidOrNumber.split('@')[0]?.split(':')[0] || '';
    return this.normalizeNumber(userPart);
  }

  private getSenderCandidates(msg: proto.IWebMessageInfo): string[] {
    const key = msg.key as ExtendedMessageKey;

    // WhatsApp MD/Baileys dapat memberikan remoteJid berbentuk @lid.
    // Pada kondisi tersebut nomor asli biasanya tersedia di senderPn/participantPn.
    return [
      key.senderPn,
      key.participantPn,
      key.remoteJidAlt,
      key.participantAlt,
      key.participant,
      key.remoteJid,
    ].filter((value): value is string => Boolean(value));
  }

  public isAdmin(msg: proto.IWebMessageInfo): boolean {
    // Pesan dari akun bot sendiri otomatis diakui sebagai admin
    if (msg.key.fromMe) return true;

    const adminNumbers = this.getAdminNumbers();
    if (adminNumbers.length === 0) {
      // Jika ADMIN_NUMBERS belum dikonfigurasi, hanya izinkan fromMe
      return false;
    }

    return this.getSenderCandidates(msg).some((candidate) => {
      // @lid bukan nomor telepon. Jangan cocokkan angka LID dengan ADMIN_NUMBERS.
      if (candidate.endsWith('@lid')) return false;

      const normalizedSender = this.normalizeJidNumber(candidate);
      return normalizedSender.length > 0 && adminNumbers.includes(normalizedSender);
    });
  }

  private getSenderDisplay(msg: proto.IWebMessageInfo): string {
    const key = msg.key as ExtendedMessageKey;
    return (
      [
        key.senderPn,
        key.participantPn,
        key.remoteJidAlt,
        key.participantAlt,
        key.participant,
        key.remoteJid,
      ].find((jid) => typeof jid === 'string' && !jid.endsWith('@lid')) ||
      key.remoteJid ||
      'unknown'
    );
  }

  public extractMessageText(msg: proto.IWebMessageInfo): string | null {
    const message = msg.message;
    if (!message) return null;

    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;

    return null;
  }

  public async handleMessage(sock: WASocket, msg: proto.IWebMessageInfo): Promise<void> {
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid === 'status@broadcast') return;

    const rawText = this.extractMessageText(msg);
    if (!rawText) return;

    const text = rawText.trim();

    // Cek apakah pesan diawali prefix perintah (/ atau ! atau .)
    const isPrefixed = /^[/!.]/.test(text);
    if (!isPrefixed) return;

    // Verifikasi otorisasi Admin
    const senderJid = this.getSenderDisplay(msg);

    if (!this.isAdmin(msg)) {
      // Abaikan tanpa membalas untuk keamanan
      return;
    }

    // Parse perintah
    const cleanCommand = text.substring(1).trim();
    const firstSpaceIndex = cleanCommand.search(/\s/);
    const command = (firstSpaceIndex === -1 ? cleanCommand : cleanCommand.substring(0, firstSpaceIndex)).toLowerCase();
    const restText = firstSpaceIndex === -1 ? '' : cleanCommand.substring(firstSpaceIndex).trim();
    const parts = cleanCommand.split(/\s+/);
    const args = parts.slice(1);

    logService.logInfo(`[WA COMMAND] Perintah "/${command}" diterima dari ${senderJid}`);

    let replyText = '';

    switch (command) {
      case 'status':
        replyText = this.handleStatus();
        break;

      case 'config':
      case 'setting':
      case 'settings':
        replyText = this.handleConfig();
        break;

      case 'setinterval':
      case 'interval':
        replyText = this.handleSetInterval(args);
        break;

      case 'setdelay':
      case 'delay':
        replyText = this.handleSetDelay(args);
        break;

      case 'setmode':
      case 'mode':
      case 'promomode':
        replyText = this.handleSetMode(args);
        break;

      case 'modes':
      case 'listmodes':
        replyText = this.handleListModes();
        break;

      case 'start':
        replyText = this.handleStart();
        break;

      case 'stop':
        replyText = this.handleStop();
        break;

      case 'scangroups':
      case 'syncgroups':
      case 'scangrup':
      case 'sync':
        replyText = await this.handleScanGroups(sock);
        break;

      case 'enablegroup':
      case 'enable':
        replyText = this.handleToggleGroup(args, true);
        break;

      case 'disablegroup':
      case 'disable':
        replyText = this.handleToggleGroup(args, false);
        break;

      case 'listgroups':
      case 'groups':
        replyText = this.handleListGroups();
        break;

      case 'addpromo':
      case 'tambahpromo':
        replyText = this.handleAddPromo(restText);
        break;

      case 'delpromo':
      case 'deletepromo':
      case 'hapuspromo':
        replyText = this.handleDelPromo(args);
        break;

      case 'viewpromo':
      case 'showpromo':
      case 'lihatpromo':
        replyText = this.handleViewPromo(args);
        break;

      case 'enablepromo':
        replyText = this.handleTogglePromo(args, true);
        break;

      case 'disablepromo':
        replyText = this.handleTogglePromo(args, false);
        break;

      case 'listpromos':
      case 'promos':
        replyText = this.handleListPromos();
        break;

      case 'send':
        replyText = await this.handleSend(args);
        break;

      case 'help':
      case 'menu':
        replyText = this.handleHelp();
        break;

      default:
        replyText = `⚠️ Perintah */${command}* tidak dikenali.\nKetik */help* untuk melihat daftar perintah.`;
        break;
    }

    if (replyText) {
      try {
        // Balas ke chat persis tempat command diterima.
        // Untuk DM modern WhatsApp, remoteJid bisa berupa @lid dan itu memang valid.
        await sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
      } catch (err) {
        logService.logError(
          `Gagal membalas pesan command ke ${remoteJid}`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  private handleStatus(): string {
    const status = promoScheduler.getStatus();
    return (
      `🤖 *STATUS WHATSAPP AUTO PROMO BOT*\n\n` +
      `• *Status WhatsApp:* ${status.waStatus === 'CONNECTED' ? '🟢 Terhubung' : '🔴 ' + status.waStatus}\n` +
      `• *Status Scheduler:* ${status.schedulerActive ? '🟢 AKTIF' : '🔴 NONAKTIF'}\n` +
      `• *Sedang Mengirim:* ${status.isExecutingTask ? '⏳ Ya (berjalan)' : '💤 Tidak (idle)'}\n` +
      `• *Interval Siklus:* Setiap ${status.intervalMinutes}\n` +
      `• *Delay Antar Grup:* ${status.delaySeconds}\n` +
      `• *Mode Pemilihan Promo:* ${status.promoSelectionMode}\n` +
      `• *Grup Aktif:* ${status.activeGroupsCount} dari ${status.totalGroupsCount} grup\n` +
      `• *Promo Aktif:* ${status.activePromosCount} dari ${status.totalPromosCount} template\n` +
      `• *Kirim Terakhir:* ${status.lastSendTime}\n` +
      `• *Jadwal Berikut:* ${status.nextScheduleTime}`
    );
  }

  private handleConfig(): string {
    const config = promoScheduler.getConfig();
    const mode = config.promoSelectionMode || 'round-robin';
    return (
      `⚙️ *KONFIGURASI DELAY & INTERVAL BOT*\n\n` +
      `• *Interval Siklus Promo:* Setiap ${promoScheduler.formatIntervalText(config.intervalMinutes)}\n` +
      `• *Delay Antar Grup:* ${promoScheduler.formatDelayText(config.randomDelaySeconds)}\n` +
      `• *Mode Pemilihan Promo:* ${mode}\n\n` +
      `💡 _Gunakan \`/setmode <mode>\` untuk mengatur cara pemilihan promo (ketik \`/modes\` untuk daftar)._\n` +
      `💡 _Gunakan \`/setinterval <min> [max]\` untuk mengatur jeda antar siklus promo (menit)._\n` +
      `💡 _Gunakan \`/setdelay <min> [max]\` untuk mengatur jeda aman antar grup per kirim (detik)._`
    );
  }

  private handleSetMode(args: string[]): string {
    if (args.length === 0) {
      return (
        `⚠️ *Format Penggunaan Salah*\n\n` +
        `Gunakan: \`/setmode <nama_mode>\`\n\n` +
        `*Pilihan Mode:* \`round-robin\`, \`random\`, \`shuffle\`, \`least-sent\`, \`per-group-round-robin\`, \`per-group-random\`, \`per-group-shuffle\`\n\n` +
        `💡 _Ketik \`/modes\` untuk melihat penjelasan detail masing-masing mode._`
      );
    }

    const modeInput = args[0];
    const res = promoScheduler.setPromoSelectionMode(modeInput);
    return `${res.success ? '✅' : '❌'} ${res.message}`;
  }

  private handleListModes(): string {
    return promoService.formatAvailableModes();
  }

  private handleSetInterval(args: string[]): string {
    if (args.length === 0) {
      return (
        `⚠️ *Format Penggunaan Salah*\n\n` +
        `Gunakan: \`/setinterval <min_menit> [max_menit]\`\n\n` +
        `*Contoh:* \n` +
        `• Jeda Acak : \`/setinterval 30 60\` (acak antara 30 s/d 60 menit)\n` +
        `• Jeda Tetap: \`/setinterval 45\` (tepat 45 menit)`
      );
    }

    const min = parseFloat(args[0]);
    const max = args.length > 1 ? parseFloat(args[1]) : min;

    if (isNaN(min) || min < 1 || (args.length > 1 && isNaN(max))) {
      return '❌ Nilai interval harus berupa angka positif (minimal 1 menit).';
    }

    const res = promoScheduler.setIntervalMinutes(min, max);
    return `${res.success ? '✅' : '❌'} ${res.message}`;
  }

  private handleSetDelay(args: string[]): string {
    if (args.length === 0) {
      return (
        `⚠️ *Format Penggunaan Salah*\n\n` +
        `Gunakan: \`/setdelay <min_detik> [max_detik]\`\n\n` +
        `*Contoh:* \n` +
        `• Jeda Acak : \`/setdelay 10 30\` (acak antara 10 s/d 30 detik)\n` +
        `• Jeda Tetap: \`/setdelay 15\` (tepat 15 detik)`
      );
    }

    const min = parseFloat(args[0]);
    const max = args.length > 1 ? parseFloat(args[1]) : min;

    if (isNaN(min) || min < 1 || (args.length > 1 && isNaN(max))) {
      return '❌ Nilai delay harus berupa angka positif (minimal 1 detik).';
    }

    const res = promoScheduler.setDelaySeconds(min, max);
    return `${res.success ? '✅' : '❌'} ${res.message}`;
  }

  private handleStart(): string {
    const res = promoScheduler.start();
    return `${res.success ? '✅' : '⚠️'} ${res.message}`;
  }

  private handleStop(): string {
    const res = promoScheduler.stop();
    return `${res.success ? '✅' : '⚠️'} ${res.message}`;
  }

  private async handleScanGroups(sock: WASocket): Promise<string> {
    try {
      const groupsRecord = await sock.groupFetchAllParticipating();
      const groups = Object.values(groupsRecord).map((g) => ({
        jid: g.id,
        name: (g.subject && g.subject.trim().length > 0) ? g.subject.trim() : 'Tanpa Nama',
      }));
      const res = groupService.syncWithWhatsApp(groups);

      return (
        `✅ *PEMINDAIAN GRUP SELESAI*\n\n` +
        `• Total grup: *${res.total}*\n` +
        `• Grup baru: *${res.added}*\n` +
        `• Nama diperbarui: *${res.updated}*\n\n` +
        `Ketik */listgroups* untuk melihat daftar grup.`
      );
    } catch (err) {
      return `❌ Gagal memindai grup dari WhatsApp: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private handleToggleGroup(args: string[], enabled: boolean): string {
    if (args.length === 0) {
      return (
        `⚠️ *Format Penggunaan Salah*\n\n` +
        `Gunakan: \`/${enabled ? 'enablegroup' : 'disablegroup'} <nomor/range/all/JID>\`\n\n` +
        `*Contoh Penggunaan:*\n` +
        `• Satuan : \`/${enabled ? 'enablegroup' : 'disablegroup'} 1\`\n` +
        `• Beberapa : \`/${enabled ? 'enablegroup' : 'disablegroup'} 1 2 3\` atau \`/${enabled ? 'enablegroup' : 'disablegroup'} 1, 2, 4\`\n` +
        `• Rentang (Range) : \`/${enabled ? 'enablegroup' : 'disablegroup'} 1-5\`\n` +
        `• Semua Grup : \`/${enabled ? 'enablegroup' : 'disablegroup'} all\`\n` +
        `• JID Grup : \`/${enabled ? 'enablegroup' : 'disablegroup'} 120363000000000001@g.us\``
      );
    }

    const res = groupService.setGroupStatus(args, enabled);
    return `${res.success ? '✅' : '⚠️'} ${res.message}`;
  }

  private handleListGroups(): string {
    const groups = groupService.getAllGroups();
    if (groups.length === 0) {
      return (
        '📋 *DAFTAR GRUP WHATSAPP*\n\n' +
        'Belum ada grup yang tersimpan.\n' +
        'Ketik */scangroups* untuk memindai semua grup dari WhatsApp Anda.'
      );
    }

    const list = groups
      .map(
        (g, i) =>
          `*${i + 1}. ${g.name}*\n   JID: \`${g.jid}\`\n   Status: ${g.enabled ? '🟢 enabled' : '🔴 disabled'}`
      )
      .join('\n\n');

    return (
      `📋 *DAFTAR GRUP TERDAFTAR (${groups.length} Grup):*\n\n` +
      `${list}\n\n` +
      `💡 _Ketik \`/scangroups\` untuk update grup terbaru._\n` +
      `💡 _Ketik \`/disablegroup 1-5\` atau \`/disablegroup 1, 2, 3\` untuk menonaktifkan banyak grup._\n` +
      `💡 _Ketik \`/disablegroup all\` atau \`/enablegroup all\` untuk mengatur semua grup._`
    );
  }

  private handleAddPromo(restText: string): string {
    const firstSpaceIndex = restText.search(/\s/);
    if (firstSpaceIndex === -1) {
      return (
        `⚠️ *Format Penggunaan addpromo Salah*\n\n` +
        `Gunakan:\n` +
        `\`/addpromo <id_promo> <teks promo...>\`\n\n` +
        `*Contoh:*\n` +
        `/addpromo promo1 🔥 Diskon 50% Hari Ini!\nHubungi kami segera.`
      );
    }

    const id = restText.substring(0, firstSpaceIndex).trim();
    const text = restText.substring(firstSpaceIndex).trim();

    if (!id || !text) {
      return '⚠️ ID promo atau teks pesan promo tidak boleh kosong.';
    }

    const res = promoService.addPromo(id, text);
    return `${res.success ? '✅' : '❌'} ${res.message}\n\nKetik */listpromos* untuk melihat daftar promo.`;
  }

  private handleDelPromo(args: string[]): string {
    if (args.length === 0) {
      return '⚠️ Gunakan: `/delpromo <nomor/id>`\nContoh: `/delpromo 1` atau `/delpromo promo1`';
    }
    const res = promoService.deletePromo(args[0]);
    return `${res.success ? '✅' : '❌'} ${res.message}`;
  }

  private handleViewPromo(args: string[]): string {
    if (args.length === 0) {
      return '⚠️ Gunakan: `/viewpromo <nomor/id>`\nContoh: `/viewpromo 1`';
    }
    const promo = promoService.getPromoByIdOrIndex(args[0]);
    if (!promo) {
      return `❌ Promo "${args[0]}" tidak ditemukan.`;
    }
    return (
      `📝 *DETAIL TEMPLATE PROMO [${promo.id}]*\n` +
      `• Status: ${promo.enabled ? '🟢 enabled' : '🔴 disabled'}\n\n` +
      `---\n${promo.text}\n---`
    );
  }

  private handleTogglePromo(args: string[], enabled: boolean): string {
    if (args.length === 0) {
      return (
        `⚠️ *Format Penggunaan Salah*\n\n` +
        `Gunakan: \`/${enabled ? 'enablepromo' : 'disablepromo'} <nomor/ID/range/all>\`\n\n` +
        `*Contoh Penggunaan:*\n` +
        `• Satuan : \`/${enabled ? 'enablepromo' : 'disablepromo'} 1\`\n` +
        `• Beberapa : \`/${enabled ? 'enablepromo' : 'disablepromo'} 1 2\` atau \`/${enabled ? 'enablepromo' : 'disablepromo'} p1, p2\`\n` +
        `• Rentang: \`/${enabled ? 'enablepromo' : 'disablepromo'} 1-3\`\n` +
        `• Semua  : \`/${enabled ? 'enablepromo' : 'disablepromo'} all\``
      );
    }
    const res = promoService.setPromoStatus(args, enabled);
    return `${res.success ? '✅' : '⚠️'} ${res.message}`;
  }

  private handleListPromos(): string {
    const promos = promoService.getAllPromos();
    if (promos.length === 0) {
      return (
        '📝 *DAFTAR TEMPLATE PROMO*\n\n' +
        'Belum ada template promo yang terdaftar.\n' +
        'Kirim */addpromo <id> <teks>* untuk menambahkan promo baru.'
      );
    }

    const list = promos
      .map((p, i) => {
        const preview = p.text.length > 70 ? p.text.substring(0, 70) + '...' : p.text;
        const formattedPreview = preview.replace(/\n/g, ' ');
        return `*${i + 1}. ID: [${p.id}]*\n   Status: ${
          p.enabled ? '🟢 enabled' : '🔴 disabled'
        }\n   Preview: _"${formattedPreview}"_`;
      })
      .join('\n\n');

    return (
      `📝 *DAFTAR TEMPLATE PROMO (${promos.length} Template):*\n\n` +
      `${list}\n\n` +
      `💡 _Ketik \`/viewpromo <nomor>\` untuk melihat isi lengkap._\n` +
      `💡 _Ketik \`/disablepromo 1-3\` atau \`/enablepromo all\` untuk mengatur status template promo._\n` +
      `💡 _Ketik \`/addpromo <id> <teks>\` untuk menambah promo baru._`
    );
  }

  private async handleSend(args: string[]): Promise<string> {
    if (args.length < 2) {
      return (
        `⚠️ *Format Penggunaan Salah*\n\n` +
        `Gunakan: \`/send <group-jid> <promo-id>\`\n` +
        `Contoh: \`/send 120363000000000001@g.us promo1\``
      );
    }

    const [groupJid, promoId] = args;
    const res = await promoScheduler.sendManual(groupJid, promoId);
    return `${res.success ? '✅' : '❌'} ${res.message}`;
  }

  private handleHelp(): string {
    return (
      `🤖 *PANDUAN PERINTAH BOT WHATSAPP*\n\n` +
      `• */status* - Cek status bot & scheduler\n` +
      `• */config* - Lihat konfigurasi delay & interval\n` +
      `• */modes* - Lihat pilihan & penjelasan mode pemilihan promo\n` +
      `• */setmode <mode>* - Ganti mode pemilihan promo (cth: /setmode shuffle)\n` +
      `• */setinterval <min> [max]* - Atur jeda siklus promo dalam menit (cth: /setinterval 30 60)\n` +
      `• */setdelay <min> [max]* - Atur jeda aman antar grup dalam detik (cth: /setdelay 10 30)\n` +
      `• */start* - Jalankan scheduler otomatis\n` +
      `• */stop* - Hentikan scheduler otomatis\n` +
      `• */scangroups* - Pindai semua grup dari WhatsApp\n` +
      `• */listgroups* - Lihat daftar grup terdaftar\n` +
      `• */enablegroup <nomor/range/all>* - Aktifkan satu/banyak grup (cth: 1, 1-5, all)\n` +
      `• */disablegroup <nomor/range/all>* - Nonaktifkan satu/banyak grup (cth: 1, 1-5, all)\n` +
      `• */addpromo <id> <teks>* - Tambah/edit template promo\n` +
      `• */delpromo <nomor/id>* - Hapus template promo\n` +
      `• */viewpromo <nomor/id>* - Lihat isi teks lengkap promo\n` +
      `• */enablepromo <nomor/id/range/all>* - Aktifkan satu/banyak template promo\n` +
      `• */disablepromo <nomor/id/range/all>* - Nonaktifkan satu/banyak template promo\n` +
      `• */listpromos* - Lihat daftar template promo\n` +
      `• */send <jid> <id>* - Kirim promo manual ke grup\n` +
      `• */help* - Tampilkan menu bantuan ini\n\n` +
      `_Catatan: Perintah hanya dapat dijalankan oleh Admin terdaftar di ADMIN_NUMBERS._`
    );
  }
}

export const messageHandler = new MessageHandler();
