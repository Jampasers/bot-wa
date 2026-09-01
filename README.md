# WhatsApp Auto Promo Bot (Node.js + TypeScript + Baileys)

Bot otomasi WhatsApp profesional berbasis **Node.js**, **TypeScript**, dan **Baileys** (`@whiskeysockets/baileys`) untuk mengirim pesan promosi secara terjadwal dan aman ke grup-grup WhatsApp yang Anda kelola atau yang telah memberikan izin resmi.

---

## 📑 Daftar Isi

1. [Fitur Utama](#-fitur-utama)
2. [Struktur Proyek](#-struktur-proyek)
3. [Prasyarat Sistem](#-prasyarat-sistem)
4. [Instalasi & Setup](#-instalasi--setup)
5. [Konfigurasi File](#-konfigurasi-file)
6. [Cara Menjalankan Bot](#-cara-menjalankan-bot)
7. [Autentikasi & QR Code](#-autentikasi--qr-code)
8. [Kontrol Bot via WhatsApp Chat (ADMIN_NUMBERS)](#-kontrol-bot-via-whatsapp-chat-admin_numbers)
9. [Panduan Mendapatkan JID Grup](#-panduan-mendapatkan-jid-grup)
10. [Manajemen Template Promo](#-manajemen-template-promo)
11. [Daftar Perintah CLI & Chat](#-daftar-perintah-cli--chat)
12. [Sistem Scheduler & Anti-Spam Safety](#-sistem-scheduler--anti-spam-safety)
13. [Sistem Logging](#-sistem-logging)
14. [Troubleshooting & FAQ](#-troubleshooting--faq)
15. [Etika & Kebijakan Keamanan](#-etika--kebijakan-keamanan)

---

## 🚀 Fitur Utama

- **Autentikasi Persistent Multi-File**: Menggunakan `useMultiFileAuthState` sehingga sesi login tersimpan di folder `auth/`. Anda hanya perlu scan QR sekali saat pertama kali setup.
- **Auto Reconnect Cerdas**: Otomatis mendeteksi pemutusan jaringan dan melakukan reconnect tanpa perlu restart aplikasi.
- **WhatsApp Chat Commands (Remote Control)**: Anda bisa mengontrol bot langsung lewat chat WhatsApp pribadi dari nomor yang terdaftar di `ADMIN_NUMBERS`.
- **Manajemen Grup Whitelist (`data/groups.json`)**: Bot **hanya** mengirim pesan ke grup yang eksplisit didaftarkan dan berstatus `enabled: true`.
- **Manajemen Template Promo Dinamis (`data/promos.json`)**: Mendukung banyak template promo dengan rotasi otomatis (round-robin atau acak).
- **Native Interval Scheduler**: Pengiriman otomatis berkala (misal setiap 60 menit) tanpa ketergantungan library cron eksternal.
- **Jeda Acak Antar Grup (Inter-Group Random Delay)**: Mencegah pengiriman beruntun secara instan (contoh: jeda 10-30 detik antar grup) untuk mematuhi ritme alami percakapan.
- **Pengiriman Manual (`send <jid> <promo-id>`)**: Fasilitas untuk mengirim promo secara instan ke grup tertentu kapan saja.
- **Dual Interface Control (CLI & WhatsApp Chat)**: Interface konsol interaktif di terminal serta kendali jarak jauh melalui pesan WhatsApp.
- **Audit Logging Lengkap (`data/logs.json`)**: Riwayat setiap pengiriman tersimpan rapi beserta timestamp, JID grup, nama grup, ID promo, status sukses/gagal, dan alasan error.
- **Clean Architecture & Strict Type-Safety**: Ditulis 100% menggunakan TypeScript dengan modularitas tinggi dan penanganan error yang tangguh.

---

## 📁 Struktur Proyek

```
Bot WhatsApp/
├── src/
│   ├── types/
│   │   └── index.ts               # Definisi tipe data & antarmuka TypeScript
│   ├── services/
│   │   ├── groupService.ts        # Layanan CRUD & validasi data/groups.json
│   │   ├── promoService.ts        # Layanan template data/promos.json
│   │   └── logService.ts          # Layanan logger terminal & data/logs.json
│   ├── whatsapp/
│   │   ├── client.ts              # Inisialisasi Baileys socket & koneksi WA
│   │   └── events.ts              # Event listener (QR code, connection, messages.upsert)
│   ├── scheduler/
│   │   └── scheduler.ts           # Mesin penjadwalan & pengiriman berkala
│   ├── commands/
│   │   ├── cli.ts                 # Antarmuka CLI interaktif Readline
│   │   └── messageHandler.ts      # Handler perintah WhatsApp Chat & ADMIN_NUMBERS
│   └── index.ts                   # Entry point aplikasi
├── data/
│   ├── groups.json                # Database grup WhatsApp terdaftar
│   ├── promos.json                # Database template pesan promo
│   ├── config.json                # Konfigurasi interval dan delay scheduler
│   └── logs.json                  # Catatan riwayat pengiriman promo
├── auth/                          # Direktori sesi WhatsApp (di-ignore oleh git)
├── .env                           # Konfigurasi environment lokal
├── .env.example                   # Template konfigurasi environment
├── .gitignore                     # Filter git untuk menjaga keamanan data sensitif
├── package.json                   # Dependensi & script eksekusi
├── tsconfig.json                  # Konfigurasi compiler TypeScript
└── README.md                      # Dokumentasi lengkap
```

---

## 📋 Prasyarat Sistem

1. **Node.js**: Versi `v18.x`, `v20.x`, atau `v22+` (Disarankan LTS).
2. **npm** atau **yarn** atau **pnpm**.
3. **Akun WhatsApp aktif** pada smartphone untuk memindai QR Code.
4. Akses internet yang stabil.

---

## 🛠️ Instalasi & Setup

1. **Buka terminal** di direktori proyek ini:
   ```bash
   cd "c:\Users\user\Desktop\Code\Bot WhatsApp"
   ```

2. **Install dependensi**:
   ```bash
   npm install
   ```

3. **Siapkan file `.env`**:
   Salin file `.env.example` ke `.env`:
   ```bash
   cp .env.example .env
   ```
   Isi file `.env` Anda:
   ```env
   AUTH_DIR=./auth
   LOG_LEVEL=silent
   DATA_DIR=./data

   # Masukkan nomor WhatsApp Anda (pemilik) yang diizinkan mengontrol bot via chat
   ADMIN_NUMBERS=6281234567890,6289876543210
   ```

---

## 📱 Kontrol Bot via WhatsApp Chat (ADMIN_NUMBERS)

Anda bisa mengontrol bot dari mana saja hanya dengan mengirim pesan chat WhatsApp:

1. **Pengaturan Nomor Admin**:
   Buka file `.env` dan atur nomor WhatsApp Anda di variabel `ADMIN_NUMBERS`:
   ```env
   ADMIN_NUMBERS=6281234567890
   ```
   *(Mendukung lebih dari 1 nomor, cukup pisahkan dengan tanda koma)*

2. **Keamanan Ekstra**:
   - Hanya nomor yang terdaftar di `ADMIN_NUMBERS` (atau pesan dari nomor bot sendiri / self-chat) yang dapat menjalankan perintah.
   - Pesan perintah dari orang lain atau anggota grup akan **diabaikan secara otomatis** tanpa merespons, sehingga bot aman dari penyalahgunaan.

3. **Cara Mengirim Perintah**:
   Cukup kirim pesan DM ke nomor bot atau chat di nomor bot sendiri dengan awalan `/` (atau `!` atau `.`):
   - `/status`
   - `/start`
   - `/stop`
   - `/listgroups`
   - `/listpromos`
   - `/send <jid> <promo-id>`
   - `/help`

---

## ⚙️ Konfigurasi File

### 1. `data/groups.json`
Daftar grup WhatsApp yang menjadi target pengiriman. Bot **hanya** akan mengirim pesan ke grup dengan `"enabled": true`.

```json
[
  {
    "jid": "120363000000000001@g.us",
    "name": "Komunitas Bisnis & Promo A",
    "enabled": true
  },
  {
    "jid": "120363000000000002@g.us",
    "name": "Grup Promosi & Usaha B",
    "enabled": true
  },
  {
    "jid": "120363000000000003@g.us",
    "name": "Grup Diskusi Internal C",
    "enabled": false
  }
]
```

### 2. `data/promos.json`
Daftar template pesan promosi. Anda dapat menambahkan formatting WhatsApp seperti `*tebal*`, `_miring_`, `~coret~`, atau emoji.

```json
[
  {
    "id": "promo1",
    "enabled": true,
    "text": "🔥 *PROMO SPESIAL HARI INI* 🔥\n\nDapatkan diskon hingga 50% untuk produk unggulan kami!\n\n📲 *Info & Pemesanan:* Hubungi Admin sekarang!"
  },
  {
    "id": "promo2",
    "enabled": true,
    "text": "⚡ *FLASH SALE TERBATAS* ⚡\n\nHemat hingga Rp100.000 khusus hari ini.\n\n👉 Hubungi kontak kami untuk klaim voucher!"
  }
]
```

### 3. `data/config.json`
Konfigurasi waktu, jeda delay, dan mode rotasi promo:

```json
{
  "intervalMinutes": {
    "min": 30,
    "max": 60
  },
  "randomDelaySeconds": {
    "min": 10,
    "max": 30
  },
  "promoSelectionMode": "round-robin"
}
```

- `intervalMinutes`: Durasi antar siklus pengiriman otomatis dalam satuan menit. Mendukung format rentang acak `{"min": 30, "max": 60}` (misal bot kirim acak setiap 30-60 menit) maupun angka tunggal fixed `60` (tepat setiap 60 menit).
- `randomDelaySeconds.min` & `max`: Jeda waktu acak (detik) saat mengirim dari satu grup ke grup berikutnya agar natural dan anti-banned.
- `promoSelectionMode`: Pilihan mode pemilihan pesan promosi yang didukung:
  1. `round-robin`: Mengirim 1 promo yang sama ke semua grup, lalu berganti urut pada siklus berikutnya (1 -> 2 -> 3 -> 1).
  2. `random`: Memilih 1 promo secara acak murni per siklus broadcast.
  3. `shuffle`: Acak tanpa pengulangan beruntun. Seluruh template promo terkirim 1x sebelum diacak ulang.
  4. `least-sent`: Otomatis memprioritaskan promo yang paling jarang terkirim berdasarkan riwayat log agar penyebaran merata.
  5. `per-group-round-robin`: Setiap grup menerima promo yang berbeda secara berurutan dalam 1 siklus yang sama.
  6. `per-group-random`: Setiap grup menerima promo acak yang dipilih secara independen dalam 1 siklus.
  7. `per-group-shuffle`: Setiap grup menerima promo acak yang berbeda tanpa duplikasi promo antar grup dalam 1 siklus.

---

## 🚦 Cara Menjalankan Bot

### Mode Development (Langsung dengan tsx):
```bash
npm run dev
```

### Mode Production (Compile TypeScript ke JavaScript):
1. **Compile source code**:
   ```bash
   npm run build
   ```
2. **Jalankan hasil build**:
   ```bash
   npm start
   ```

---

## 📱 Autentikasi & QR Code

1. Saat pertama kali dijalankan, bot akan menampilkan QR Code di terminal:
   ```
   ==================================================
            SCAN QR CODE DENGAN WHATSAPP ANDA
   ==================================================
   ```
2. Buka aplikasi **WhatsApp** di smartphone Anda.
3. Masuk ke **Menu Titik Tiga (Android)** atau **Pengaturan (iOS)** > **Perangkat Tertaut (Linked Devices)**.
4. Pilih **Tautkan Perangkat (Link a Device)** dan arahkan kamera ke QR Code di terminal.
5. Setelah berhasil terhubung, terminal akan menampilkan log:
   ```
   [14:30:15] [INFO] WhatsApp connected
   ```
6. Sesi login akan disimpan secara otomatis di folder `auth/`. Pada saat restart aplikasi berikutnya, bot akan langsung terhubung tanpa meminta scan QR ulang.

> **Catatan:** Jika Anda melakukan *Logout* dari smartphone, bot akan secara otomatis membersihkan folder `auth/` dan membuat QR Code baru.

---

## 📝 Manajemen Template Promo

Anda dapat mengelola template pesan promosi dengan sangat mudah:

### 1. Menambahkan Promo via Terminal CLI:
- **Mode Multi-Baris (Mudah / Paste Langsung)**:
  Ketik `addpromo promo1` di terminal, lalu paste teks pesan promosi Anda (bisa banyak baris, emoji, formatting WhatsApp). Ketik `SELESAI` di baris terakhir lalu Enter.
- **Mode Satu Baris**:
  `addpromo promo1 🔥 Promo Spesial Hari Ini!\nHubungi kami sekarang.`

### 2. Menambahkan Promo via WhatsApp Chat (Admin):
Kirim pesan ke bot dari nomor admin:
```
/addpromo promo1
🔥 *PROMO SPESIAL HARI INI* 🔥
Dapatkan diskon 50% untuk semua produk!
Hubungi admin sekarang.
```

### 3. Mengatur Status & Menghapus Promo:
- `viewpromo <nomor/id>` : Melihat teks lengkap pesan promo.
- `disablepromo <nomor/id>` : Menonaktifkan promo tertentu agar tidak dikirim oleh scheduler.
- `enablepromo <nomor/id>` : Mengaktifkan kembali promo tersebut.
- `delpromo <nomor/id>` : Menghapus template promo dari database.

---

## 💻 Daftar Perintah CLI & Chat

Perintah dapat dikirim melalui **Terminal CLI** maupun melalui **Chat WhatsApp**:

| Perintah | Contoh | Penjelasan |
| :--- | :--- | :--- |
| `status` / `/status` | `/status` | Menampilkan ringkasan status WhatsApp, scheduler, interval, delay, grup, promo, dan jadwal kirim. |
| `config` / `/config` | `/config` | Menampilkan konfigurasi interval, jeda antar grup, dan mode pemilihan promo saat ini. |
| `modes` / `/modes` | `/modes` | Menampilkan daftar seluruh mode pemilihan promo yang tersedia beserta penjelasan detailnya. |
| `setmode <mode>` / `/setmode <mode>` | `/setmode shuffle` atau `/setmode per-group-round-robin` | Mengatur mode pemilihan/rotasi promo (mendukung `round-robin`, `random`, `shuffle`, `least-sent`, `per-group-round-robin`, `per-group-random`, `per-group-shuffle`). |
| `setinterval <min> [max]` / `/setinterval <...>` | `/setinterval 30 60` atau `/setinterval 45` | Mengatur jeda siklus broadcast promosi dalam menit (bisa rentang acak min-max atau angka tetap). |
| `setdelay <min> [max]` / `/setdelay <...>` | `/setdelay 10 30` atau `/setdelay 15` | Mengatur jeda aman antar grup per pengiriman dalam detik (bisa rentang acak min-max atau angka tetap). |
| `start` / `/start` | `/start` | Mengaktifkan scheduler otomatis (mengirim langsung putaran pertama lalu berjalan sesuai interval). |
| `stop` / `/stop` | `/stop` | Menghentikan pengiriman otomatis scheduler. |
| `scangroups` / `/scangroups` | `/scangroups` | Memindai dan menyinkronkan seluruh grup WhatsApp yang diikuti akun bot. |
| `listgroups` / `/listgroups` | `/listgroups` | Menampilkan seluruh grup hasil scan beserta status `enabled`/`disabled`. |
| `enablegroup <nomor/range/all>` / `/enablegroup <...>` | `/enablegroup 1` atau `/enablegroup 1-5` atau `/enablegroup all` | Mengaktifkan pengiriman promo ke 1 atau banyak grup (mendukung nomor, list `1 2 3`, range `1-5`, JID, atau `all`). |
| `disablegroup <nomor/range/all>` / `/disablegroup <...>` | `/disablegroup 2` atau `/disablegroup 1, 3, 5` atau `/disablegroup all` | Menonaktifkan pengiriman promo ke 1 atau banyak grup (mendukung nomor, list `1 2 3`, range `1-5`, JID, atau `all`). |
| `addpromo <id> [teks]` / `/addpromo <id> <teks>` | `/addpromo p1 Diskon 50%` | Menambahkan atau memperbarui template pesan promo (bisa multi-baris). |
| `listpromos` / `/listpromos` | `/listpromos` | Menampilkan seluruh template promo beserta ID, status, dan pratinjau teks. |
| `viewpromo <nomor/id>` / `/viewpromo <nomor/id>` | `/viewpromo 1` | Melihat isi lengkap teks promo. |
| `enablepromo <nomor/range/all>` / `/enablepromo <...>` | `/enablepromo 1` atau `/enablepromo 1-3` atau `/enablepromo all` | Mengaktifkan 1 atau banyak template promo. |
| `disablepromo <nomor/range/all>` / `/disablepromo <...>` | `/disablepromo 1` atau `/disablepromo all` | Menonaktifkan 1 atau banyak template promo. |
| `delpromo <nomor/id>` / `/delpromo <nomor/id>` | `/delpromo 1` | Menghapus template promo dari database. |
| `send <jid> <id>` | `/send 120363xxxxxx@g.us promo1` | Mengirim promo tertentu secara manual ke grup terdaftar. |
| `help` / `/help` | `/help` | Menampilkan panduan bantuan perintah. |
| `exit` *(Hanya CLI)* | `exit` | Menutup koneksi WhatsApp secara rapi dan menghentikan bot. |

---

## ⏱️ Sistem Scheduler & Anti-Spam Safety

Aplikasi ini mengimplementasikan prinsip pengiriman yang aman dan tertib:

1. **Non-Blasting / Sequential Processing**: Bot tidak mengirim pesan ke puluhan grup sekaligus secara serentak.
2. **Dynamic Random Delay**: Di antara setiap grup yang dikirim, bot menyisipkan jeda waktu acak (contoh: antara 10 hingga 30 detik).
3. **Execution Locking**: Jika satu siklus masih berlangsung, siklus baru tidak akan bertabrakan (*prevent race condition*).
4. **Isolasi Error Per-Grup**: Jika satu grup gagal menerima pesan, bot tetap melanjutkan proses ke grup-grup berikutnya dan mencatat error tersebut ke log.

---

## 📜 Sistem Logging

Semua aktivitas pengiriman dicatat dengan format terstruktur:

### Contoh Log Konsol:
```
[10:00:00] [INFO] Memulai koneksi ke WhatsApp Web...
[10:00:05] [INFO] WhatsApp connected
[10:00:30] [INFO] [WA COMMAND] Perintah "/status" diterima dari 6281234567890@s.whatsapp.net
[10:01:00] [INFO] Memulai pengiriman otomatis [promo1] ke 2 grup aktif...
[10:01:00] [INFO] Sending promo1 -> Komunitas Bisnis & Promo A
[10:01:02] [SUCCESS] Message sent -> Komunitas Bisnis & Promo A
[10:01:02] [INFO] Menunggu jeda aman selama 14 detik sebelum grup berikutnya...
[10:01:16] [INFO] Sending promo1 -> Grup Promosi & Usaha B
[10:01:18] [SUCCESS] Message sent -> Grup Promosi & Usaha B
[10:01:18] [INFO] Siklus pengiriman promo selesai.
```

---

## ❓ Troubleshooting & FAQ

### Q: Mengapa perintah via WhatsApp tidak dibalas oleh bot?
> **Solusi**:
> 1. Pastikan nomor WhatsApp pengirim sudah terdaftar di variabel `ADMIN_NUMBERS` pada file `.env`.
> 2. Pastikan nomor diawali kode negara (contoh: `6281234567890`).
> 3. Pastikan pesan diawali garis miring (contoh: `/status` atau `/help`).
> 4. Pastikan bot dalam status `🟢 Terhubung (Connected)`.

### Q: Ingin reset atau ganti nomor WhatsApp bot?
> **Solusi**:
> 1. Matikan bot (`exit`).
> 2. Hapus folder `auth/`.
> 3. Jalankan kembali `npm start` dan scan QR dengan nomor baru.

---

## 🛡️ Etika & Kebijakan Keamanan

- **Anti-Spam Compliance**: Gunakan bot ini **hanya** pada grup WhatsApp milik Anda sendiri atau grup publik/komunitas di mana Anda memiliki izin resmi dari pengelola untuk membagikan informasi promosi.
- **Kerahasiaan Data**: Jangan pernah membagikan atau mengunggah folder `auth/` atau file `.env` ke repository publik (GitHub/GitLab) karena berisi token sesi WhatsApp Anda. File `.gitignore` telah dikonfigurasi untuk mencegah file ini ter-commit secara tidak sengaja.
