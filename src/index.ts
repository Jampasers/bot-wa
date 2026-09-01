import dotenv from 'dotenv';
dotenv.config();

// Saring log internal libsignal/baileys agar tidak mengotori antarmuka terminal
const originalConsoleInfo = console.info;
console.info = function (...args: unknown[]) {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Closing session:') ||
      args[0].includes('Opening session:') ||
      args[0].includes('Removing old closed session:') ||
      args[0].includes('Migrating session to:'))
  ) {
    return;
  }
  originalConsoleInfo.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = function (...args: unknown[]) {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Closing open session') ||
      args[0].includes('Decrypted message with closed session') ||
      args[0].includes('Session already'))
  ) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

const originalConsoleError = console.error;
console.error = function (...args: unknown[]) {
  const isIgnored = args.some((arg) => {
    if (typeof arg === 'string') {
      return (
        arg.includes('Failed to decrypt message with any known session') ||
        arg.includes('Session error:') ||
        arg.includes('Bad MAC') ||
        arg.includes('No matching sessions found for message') ||
        arg.includes('UntrustedIdentityKeyError') ||
        arg.includes('SessionError') ||
        arg.includes('session_cipher.js') ||
        arg.includes('libsignal')
      );
    }
    if (arg instanceof Error) {
      return (
        arg.message.includes('Bad MAC') ||
        arg.message.includes('No matching sessions found') ||
        arg.message.includes('UntrustedIdentityKey') ||
        Boolean(arg.stack?.includes('libsignal')) ||
        Boolean(arg.stack?.includes('session_cipher.js'))
      );
    }
    return false;
  });

  if (isIgnored) {
    return;
  }
  originalConsoleError.apply(console, args);
};

import { waClient } from './whatsapp/client.js';
import { groupService } from './services/groupService.js';
import { promoService } from './services/promoService.js';
import { promoScheduler } from './scheduler/scheduler.js';
import { logService } from './services/logService.js';
import { CLIInterface } from './commands/cli.js';

async function main(): Promise<void> {
  // Global error safety handlers
  process.on('uncaughtException', (err) => {
    logService.logError('Uncaught Exception', err.message);
  });

  process.on('unhandledRejection', (reason) => {
    logService.logError(
      'Unhandled Rejection',
      reason instanceof Error ? reason.message : String(reason)
    );
  });

  // Bind WhatsApp client to scheduler
  promoScheduler.setClient(waClient);

  const cli = new CLIInterface(promoScheduler, groupService, promoService, waClient);

  // Graceful shutdown on termination signals
  const cleanup = async () => {
    logService.logInfo('Menerima sinyal terminasi. Menghentikan bot...');
    promoScheduler.stop();
    await waClient.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Start CLI
  cli.start();

  // Connect to WhatsApp
  logService.logInfo('Memulai koneksi ke WhatsApp Web...');
  await waClient.connect();
}

main().catch((err) => {
  logService.logError('Fatal error in main application:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
