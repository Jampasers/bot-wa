import {
  DisconnectReason,
  type WASocket,
  type ConnectionState,
  type BaileysEventMap,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logService } from '../services/logService.js';
import { groupService } from '../services/groupService.js';
import { messageHandler } from '../commands/messageHandler.js';
import type { WhatsAppClient } from './client.js';

export function setupConnectionEvents(
  sock: WASocket,
  client: WhatsAppClient,
  saveCreds: () => Promise<void>
): void {
  // Save credentials on update
  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err) {
      logService.logError('Gagal menyimpan credentials WhatsApp', err instanceof Error ? err.message : String(err));
    }
  });

  // Handle incoming messages for WhatsApp Chat Commands
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await messageHandler.handleMessage(sock, msg);
      } catch (err) {
        logService.logError(
          'Error saat memproses pesan masuk',
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  });

  // Handle connection updates
  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      client.setStatus('QR_READY');
      console.log('\n==================================================');
      console.log('         SCAN QR CODE DENGAN WHATSAPP ANDA        ');
      console.log('==================================================\n');
      qrcode.generate(qr, { small: true });
      console.log('\nPetunjuk: Buka WhatsApp > Menu Titik Tiga / Pengaturan > Perangkat Tertaut > Tautkan Perangkat\n');
    }

    if (connection === 'open') {
      client.setStatus('CONNECTED');
      logService.logInfo('WhatsApp connected');

      // Auto-scan real participating groups from WhatsApp
      try {
        logService.logInfo('Memindai daftar grup yang diikuti di WhatsApp...');
        const fetched = await client.fetchParticipatingGroups();
        const syncResult = groupService.syncWithWhatsApp(fetched);
        logService.logInfo(
          `Pemindaian grup selesai: ${syncResult.total} grup ditemukan (${syncResult.added} baru ditambahkan).`
        );
      } catch (err) {
        logService.logError(
          'Gagal melakukan auto-scan grup saat koneksi terhubung:',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    if (connection === 'close') {
      const error = lastDisconnect?.error as any;
      const statusCode = error?.output?.statusCode || error?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        logService.logError(
          'Sesi WhatsApp telah berakhir (Logged Out). Sesi lama akan dibersihkan.'
        );
        client.setStatus('DISCONNECTED');
        client.handleLoggedOut();
      } else {
        logService.logInfo(
          `Koneksi WhatsApp terputus (Status: ${statusCode || 'unknown'}). Mencoba reconnect...`
        );
        client.setStatus('CONNECTING');
        client.scheduleReconnect();
      }
    }
  });
}
