import readline from 'node:readline';
import { PromoScheduler } from '../scheduler/scheduler.js';
import { GroupService } from '../services/groupService.js';
import { PromoService } from '../services/promoService.js';
import { WhatsAppClient } from '../whatsapp/client.js';

export class CLIInterface {
  private rl: readline.Interface | null = null;
  private isRunning: boolean = false;
  private multiLineState: {
    active: boolean;
    promoId: string;
    lines: string[];
  } = { active: false, promoId: '', lines: [] };

  constructor(
    private scheduler: PromoScheduler,
    private groupService: GroupService,
    private promoService: PromoService,
    private waClient: WhatsAppClient
  ) {}

  public printBanner(): void {
    console.log('\n==================================================');
    console.log('             WhatsApp Auto Promo Bot              ');
    console.log('==================================================');
    console.log('Perintah yang tersedia:');
    console.log('  status                         - Lihat status WhatsApp & scheduler');
    console.log('  config                         - Lihat konfigurasi interval & delay');
    console.log('  modes                          - Lihat daftar & penjelasan mode pemilihan promo');
    console.log('  setmode <mode>                 - Ganti mode pemilihan promo (cth: setmode shuffle)');
    console.log('  setinterval <min> [max]        - Atur jeda siklus promosi (menit)');
    console.log('  setdelay <min> [max]           - Atur jeda antar grup (detik)');
    console.log('  start                          - Mulai pengiriman otomatis');
    console.log('  stop                           - Hentikan pengiriman otomatis');
    console.log('  scangroups                     - Pindai & simpan semua grup dari WhatsApp');
    console.log('  listgroups                     - Tampilkan daftar grup terdaftar');
    console.log('  enablegroup <nomor/range/all>  - Aktifkan promo untuk 1/banyak grup');
    console.log('  disablegroup <nomor/range/all> - Nonaktifkan promo untuk 1/banyak grup');
    console.log('  addpromo <id> [teks]           - Tambah/edit template teks promo');
    console.log('  delpromo <nomor/id>            - Hapus template promo');
    console.log('  viewpromo <nomor/id>           - Lihat isi lengkap teks promo');
    console.log('  enablepromo <nomor/range/all>  - Aktifkan 1/banyak template promo');
    console.log('  disablepromo <nomor/range/all> - Nonaktifkan 1/banyak template promo');
    console.log('  listpromos                     - Tampilkan daftar template promo');
    console.log('  send <jid> <id>                - Kirim promo manual ke grup tertentu');
    console.log('  help                           - Tampilkan bantuan perintah');
    console.log('  exit                           - Keluar dari aplikasi');
    console.log('==================================================\n');
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.printBanner();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'bot> ',
    });

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      if (this.multiLineState.active) {
        const trimmed = line.trim();
        if (trimmed.toUpperCase() === 'SELESAI' || trimmed.toUpperCase() === 'END') {
          const fullText = this.multiLineState.lines.join('\n').trim();
          if (!fullText) {
            console.log('\n⚠️ Teks promo kosong. Penambahan promo dibatalkan.\n');
          } else {
            const res = this.promoService.addPromo(this.multiLineState.promoId, fullText);
            console.log(`\n${res.success ? '✅' : '❌'} ${res.message}\n`);
          }
          this.multiLineState = { active: false, promoId: '', lines: [] };
          if (this.rl) {
            this.rl.setPrompt('bot> ');
            this.rl.prompt();
          }
          return;
        }

        if (trimmed.toUpperCase() === 'BATAL' || trimmed.toUpperCase() === 'CANCEL') {
          console.log('\n⚠️ Penambahan promo dibatalkan.\n');
          this.multiLineState = { active: false, promoId: '', lines: [] };
          if (this.rl) {
            this.rl.setPrompt('bot> ');
            this.rl.prompt();
          }
          return;
        }

        this.multiLineState.lines.push(line);
        if (this.rl) {
          this.rl.prompt();
        }
        return;
      }

      const input = line.trim();
      if (input) {
        await this.handleCommand(input);
      }
      if (this.isRunning && this.rl && !this.multiLineState.active) {
        this.rl.prompt();
      }
    });

    this.rl.on('close', async () => {
      if (this.isRunning) {
        await this.handleExit();
      }
    });
  }

  public async handleCommand(input: string): Promise<void> {
    // Strip leading slash if user typed /status, /start, etc.
    const normalizedInput = input.startsWith('/') ? input.substring(1) : input;
    const parts = normalizedInput.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'status':
        this.showStatus();
        break;

      case 'config':
      case 'setting':
      case 'settings':
        this.showConfig();
        break;

      case 'setinterval':
      case 'interval':
        this.handleSetInterval(args);
        break;

      case 'setdelay':
      case 'delay':
        this.handleSetDelay(args);
        break;

      case 'setmode':
      case 'mode':
      case 'promomode':
        this.handleSetMode(args);
        break;

      case 'modes':
      case 'listmodes':
        this.showModes();
        break;

      case 'start':
        this.handleStart();
        break;

      case 'stop':
        this.handleStop();
        break;

      case 'scangroups':
      case 'syncgroups':
      case 'scangrup':
      case 'sync':
        await this.handleScanGroups();
        break;

      case 'enablegroup':
      case 'enable':
        this.handleToggleGroup(args, true);
        break;

      case 'disablegroup':
      case 'disable':
        this.handleToggleGroup(args, false);
        break;

      case 'listgroups':
      case 'groups':
        this.showGroups();
        break;

      case 'addpromo':
      case 'tambahpromo':
        this.handleAddPromo(args);
        break;

      case 'delpromo':
      case 'deletepromo':
      case 'hapuspromo':
        this.handleDelPromo(args);
        break;

      case 'viewpromo':
      case 'showpromo':
      case 'lihatpromo':
        this.handleViewPromo(args);
        break;

      case 'enablepromo':
        this.handleTogglePromo(args, true);
        break;

      case 'disablepromo':
        this.handleTogglePromo(args, false);
        break;

      case 'listpromos':
      case 'promos':
        this.showPromos();
        break;

      case 'send':
        await this.handleSend(args);
        break;

      case 'help':
        this.printBanner();
        break;

      case 'exit':
      case 'quit':
        await this.handleExit();
        break;

      default:
        console.log(`\nPerintah "${parts[0]}" tidak dikenali. Ketik "help" untuk melihat daftar perintah.\n`);
        break;
    }
  }

  private showStatus(): void {
    const status = this.scheduler.getStatus();
    console.log('\n--- STATUS BOT WHATSAPP ---');
    console.log(`Status WhatsApp       : ${this.formatWaStatus(status.waStatus)}`);
    console.log(`Status Scheduler      : ${status.schedulerActive ? '🟢 AKTIF' : '🔴 NONAKTIF'}`);
    console.log(`Sedang Mengirim       : ${status.isExecutingTask ? 'Ya (proses berjalan)' : 'Tidak (idle)'}`);
    console.log(`Interval Siklus       : Setiap ${status.intervalMinutes}`);
    console.log(`Delay Antar Grup      : ${status.delaySeconds}`);
    console.log(`Mode Pemilihan Promo  : ${status.promoSelectionMode}`);
    console.log(`Grup Aktif            : ${status.activeGroupsCount} dari ${status.totalGroupsCount} total grup`);
    console.log(`Promo Aktif           : ${status.activePromosCount} dari ${status.totalPromosCount} template`);
    console.log(`Pengiriman Terakhir   : ${status.lastSendTime}`);
    console.log(`Jadwal Berikutnya     : ${status.nextScheduleTime}`);
    console.log('---------------------------\n');
  }

  private showConfig(): void {
    const config = this.scheduler.getConfig();
    console.log('\n--- KONFIGURASI DELAY & INTERVAL BOT ---');
    console.log(`Interval Siklus Promo : Setiap ${this.scheduler.formatIntervalText(config.intervalMinutes)}`);
    console.log(`Delay Antar Grup      : ${this.scheduler.formatDelayText(config.randomDelaySeconds)}`);
    console.log(`Mode Pemilihan Promo  : ${config.promoSelectionMode || 'round-robin'}`);
    console.log('----------------------------------------');
    console.log('💡 Gunakan "setmode <mode>" untuk mengubah mode pemilihan promo (ketik "modes" untuk daftar).');
    console.log('💡 Gunakan "setinterval <min> [max]" untuk mengatur jeda antar siklus promo (menit).');
    console.log('💡 Gunakan "setdelay <min> [max]" untuk mengatur jeda antar grup per kirim (detik).\n');
  }

  private handleSetMode(args: string[]): void {
    if (args.length === 0) {
      console.log('\n⚠️ Format salah!');
      console.log('Penggunaan: setmode <nama_mode>');
      console.log('Pilihan Mode: round-robin, random, shuffle, least-sent, per-group-round-robin, per-group-random, per-group-shuffle');
      console.log('💡 Ketik "modes" untuk melihat penjelasan detail masing-masing mode.\n');
      return;
    }

    const res = this.scheduler.setPromoSelectionMode(args[0]);
    console.log(`\n${res.success ? '✅' : '❌'} ${res.message.replace(/\*/g, '')}\n`);
  }

  private showModes(): void {
    console.log('\n' + this.promoService.formatAvailableModes().replace(/\*/g, '').replace(/_/g, '') + '\n');
  }

  private handleSetInterval(args: string[]): void {
    if (args.length === 0) {
      console.log('\n⚠️ Format salah!');
      console.log('Penggunaan: setinterval <min_menit> [max_menit]');
      console.log('Contoh (Jeda Acak) : setinterval 30 60  (acak antara 30-60 menit)');
      console.log('Contoh (Jeda Tetap): setinterval 45     (tepat 45 menit)\n');
      return;
    }

    const min = parseFloat(args[0]);
    const max = args.length > 1 ? parseFloat(args[1]) : min;

    if (isNaN(min) || min < 1 || (args.length > 1 && isNaN(max))) {
      console.log('\n❌ Nilai interval harus berupa angka positif (minimal 1 menit).\n');
      return;
    }

    const res = this.scheduler.setIntervalMinutes(min, max);
    console.log(`\n${res.success ? '✅' : '❌'} ${res.message.replace(/\*/g, '')}\n`);
  }

  private handleSetDelay(args: string[]): void {
    if (args.length === 0) {
      console.log('\n⚠️ Format salah!');
      console.log('Penggunaan: setdelay <min_detik> [max_detik]');
      console.log('Contoh (Jeda Acak) : setdelay 10 30  (acak antara 10-30 detik)');
      console.log('Contoh (Jeda Tetap): setdelay 15     (tepat 15 detik)\n');
      return;
    }

    const min = parseFloat(args[0]);
    const max = args.length > 1 ? parseFloat(args[1]) : min;

    if (isNaN(min) || min < 1 || (args.length > 1 && isNaN(max))) {
      console.log('\n❌ Nilai delay harus berupa angka positif (minimal 1 detik).\n');
      return;
    }

    const res = this.scheduler.setDelaySeconds(min, max);
    console.log(`\n${res.success ? '✅' : '❌'} ${res.message.replace(/\*/g, '')}\n`);
  }

  private formatWaStatus(status: string): string {
    switch (status) {
      case 'CONNECTED':
        return '🟢 Terhubung (Connected)';
      case 'CONNECTING':
        return '🟡 Menghubungkan (Connecting...)';
      case 'QR_READY':
        return '📷 Siap scan QR (QR Ready)';
      case 'DISCONNECTED':
      default:
        return '🔴 Terputus (Disconnected)';
    }
  }

  private handleStart(): void {
    const res = this.scheduler.start();
    console.log(`\n${res.success ? '✅' : '⚠️'} ${res.message}\n`);
  }

  private handleStop(): void {
    const res = this.scheduler.stop();
    console.log(`\n${res.success ? '✅' : '⚠️'} ${res.message}\n`);
  }

  private async handleScanGroups(): Promise<void> {
    if (!this.waClient.isConnected()) {
      console.log(`\n⚠️ WhatsApp belum terhubung (Status: ${this.waClient.getStatus()}).`);
      console.log('Silakan hubungkan WhatsApp terlebih dahulu (scan QR) sebelum memindai grup.\n');
      return;
    }

    console.log('\nMemindai daftar grup dari akun WhatsApp Anda...');
    try {
      const fetched = await this.waClient.fetchParticipatingGroups();
      const result = this.groupService.syncWithWhatsApp(fetched);

      console.log(`\n✅ Pemindaian grup selesai!`);
      console.log(`Total grup ditemukan : ${result.total}`);
      console.log(`Grup baru ditambahkan: ${result.added}`);
      console.log(`Nama grup diperbarui : ${result.updated}`);
      console.log('\n--- DAFTAR GRUP WHATSAPP HASIL SCAN ---');
      console.log(this.groupService.formatGroupList());
      console.log('---------------------------------------');
      console.log('💡 Gunakan "disablegroup <nomor>" untuk menonaktifkan grup dari promo.');
      console.log('💡 Gunakan "enablegroup <nomor>" untuk mengaktifkan kembali grup.\n');
    } catch (err) {
      console.log(`\n❌ Gagal memindai grup: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  private handleToggleGroup(args: string[], enabled: boolean): void {
    if (args.length === 0) {
      console.log(`\n⚠️ Format salah! Gunakan: ${enabled ? 'enablegroup' : 'disablegroup'} <nomor/range/all/JID>`);
      console.log('Contoh:');
      console.log(`  ${enabled ? 'enablegroup' : 'disablegroup'} 1`);
      console.log(`  ${enabled ? 'enablegroup' : 'disablegroup'} 1 2 3`);
      console.log(`  ${enabled ? 'enablegroup' : 'disablegroup'} 1-5`);
      console.log(`  ${enabled ? 'enablegroup' : 'disablegroup'} all\n`);
      return;
    }

    const res = this.groupService.setGroupStatus(args, enabled);
    console.log(`\n${res.success ? '✅' : '⚠️'} ${res.message}\n`);
  }

  private showGroups(): void {
    console.log('\n--- DAFTAR GRUP WHATSAPP ---');
    console.log(this.groupService.formatGroupList());
    console.log('----------------------------');
    console.log('💡 Ketik "scangroups" untuk memindai ulang grup dari WhatsApp.');
    console.log('💡 Ketik "disablegroup 1-5" atau "enablegroup all" untuk mengatur status grup sekaligus.\n');
  }

  private handleAddPromo(args: string[]): void {
    if (args.length >= 2) {
      const id = args[0];
      const text = args.slice(1).join(' ').replace(/\\n/g, '\n');
      const res = this.promoService.addPromo(id, text);
      console.log(`\n${res.success ? '✅' : '❌'} ${res.message}\n`);
      return;
    }

    if (args.length === 1) {
      const id = args[0].trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      this.multiLineState = { active: true, promoId: id, lines: [] };
      console.log(`\n--- MENULIS TEKS PROMO [${id}] ---`);
      console.log('Ketik atau paste teks promo Anda (bisa banyak baris, emoji, formatting WhatsApp).');
      console.log('Ketik "SELESAI" di baris baru lalu Enter untuk menyimpan.');
      console.log('Ketik "BATAL" untuk membatalkan.\n');
      if (this.rl) {
        this.rl.setPrompt('promo> ');
        this.rl.prompt();
      }
      return;
    }

    console.log('\n⚠️ Format Penggunaan addpromo:');
    console.log('1. Mode Multi-Baris (Mudah / Tinggal Paste):');
    console.log('   Ketik : addpromo <id>');
    console.log('   Contoh: addpromo promo1');
    console.log('   (Lalu paste pesan promosi Anda dan ketik SELESAI di baris terakhir)\n');
    console.log('2. Mode Satu Baris:');
    console.log('   Ketik : addpromo <id> <teks promo...>');
    console.log('   Contoh: addpromo promo1 Diskon 50% hari ini!\\nHubungi admin sekarang\\n');
  }

  private handleDelPromo(args: string[]): void {
    if (args.length === 0) {
      console.log('\n⚠️ Format salah! Gunakan: delpromo <nomor atau ID promo>');
      console.log('Contoh: delpromo 1 atau delpromo promo1\n');
      return;
    }

    const identifier = args[0];
    const res = this.promoService.deletePromo(identifier);
    console.log(`\n${res.success ? '✅' : '⚠️'} ${res.message}\n`);
  }

  private handleViewPromo(args: string[]): void {
    if (args.length === 0) {
      console.log('\n⚠️ Format salah! Gunakan: viewpromo <nomor atau ID promo>');
      console.log('Contoh: viewpromo 1 atau viewpromo promo1\n');
      return;
    }

    const identifier = args[0];
    console.log(`\n${this.promoService.formatPromoDetail(identifier)}\n`);
  }

  private handleTogglePromo(args: string[], enabled: boolean): void {
    if (args.length === 0) {
      console.log(`\n⚠️ Format salah! Gunakan: ${enabled ? 'enablepromo' : 'disablepromo'} <nomor/ID/range/all>`);
      console.log('Contoh:');
      console.log(`  ${enabled ? 'enablepromo' : 'disablepromo'} 1`);
      console.log(`  ${enabled ? 'enablepromo' : 'disablepromo'} 1 2`);
      console.log(`  ${enabled ? 'enablepromo' : 'disablepromo'} 1-3`);
      console.log(`  ${enabled ? 'enablepromo' : 'disablepromo'} all\n`);
      return;
    }

    const res = this.promoService.setPromoStatus(args, enabled);
    console.log(`\n${res.success ? '✅' : '⚠️'} ${res.message}\n`);
  }

  private showPromos(): void {
    console.log('\n--- DAFTAR TEMPLATE PROMO ---');
    console.log(this.promoService.formatPromoList());
    console.log('-----------------------------');
    console.log('💡 Ketik "addpromo <id>" untuk menambah teks promo baru.');
    console.log('💡 Ketik "viewpromo <nomor/id>" untuk melihat isi lengkap teks promo.');
    console.log('💡 Ketik "disablepromo 1-3" atau "enablepromo all" untuk mengatur status template promo.');
    console.log('💡 Ketik "delpromo <nomor/id>" untuk menghapus promo.\n');
  }

  private async handleSend(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log('\n⚠️ Format salah!');
      console.log('Penggunaan: send <group-jid> <promo-id>');
      console.log('Contoh    : send 120363xxxxxxxx@g.us promo1\n');
      return;
    }

    const [groupJid, promoId] = args;
    console.log(`\nMemproses pengiriman promo [${promoId}] ke ${groupJid}...`);
    const res = await this.scheduler.sendManual(groupJid, promoId);
    console.log(`${res.success ? '✅' : '❌'} ${res.message}\n`);
  }

  private async handleExit(): Promise<void> {
    console.log('\nMenutup bot WhatsApp...');
    this.isRunning = false;
    this.scheduler.stop();
    await this.waClient.disconnect();
    if (this.rl) {
      this.rl.close();
    }
    console.log('Aplikasi selesai. Sampai jumpa!');
    process.exit(0);
  }
}
