export interface GroupConfig {
  jid: string;
  name: string;
  enabled: boolean;
}

export interface PromoTemplate {
  id: string;
  enabled: boolean;
  text: string;
}

export interface RandomDelayConfig {
  min: number;
  max: number;
}

export type IntervalMinutesConfig = number | RandomDelayConfig;

export type PromoSelectionMode =
  | 'round-robin'
  | 'random'
  | 'shuffle'
  | 'least-sent'
  | 'per-group-round-robin'
  | 'per-group-random'
  | 'per-group-shuffle';

export interface BotConfig {
  intervalMinutes: IntervalMinutesConfig;
  randomDelaySeconds: RandomDelayConfig;
  promoSelectionMode?: PromoSelectionMode;
}

export type LogStatus = 'SUCCESS' | 'FAILED';

export interface LogEntry {
  timestamp: string;
  groupJid: string;
  groupName: string;
  promoId: string;
  status: LogStatus;
  error?: string;
}

export type WhatsAppConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'QR_READY'
  | 'CONNECTED';

export interface BotStatus {
  waStatus: WhatsAppConnectionStatus;
  schedulerActive: boolean;
  isExecutingTask: boolean;
  activeGroupsCount: number;
  totalGroupsCount: number;
  activePromosCount: number;
  totalPromosCount: number;
  lastSendTime: string | null;
  nextScheduleTime: string | null;
  intervalMinutes: string;
  delaySeconds: string;
  promoSelectionMode: PromoSelectionMode;
}
