/** Messaging: the log of what the system sent, the plan's paid messages, the notices in the bell. Mirrors the server's MessagingModels. */

export type MessageChannel = 'InApp' | 'Email' | 'Sms' | 'WhatsApp';
export type MessageStatus = 'Queued' | 'Sent' | 'Failed';

export interface MessageLogDto {
  id: string;
  channel: MessageChannel;
  status: MessageStatus;
  template: string;
  subject: string;
  toName: string | null;
  /** The address or number, masked (a***@example.com). */
  to: string | null;
  paid: boolean;
  attempts: number;
  createdAtUtc: string;
  sentAtUtc: string | null;
  error: string | null;
  note: string | null;
}

export interface MessageChannelStateDto {
  channel: MessageChannel;
  label: string;
  /** The server can really send on this channel today; false means messages on it fail with a reason. */
  configured: boolean;
  /** Counts against the plan's monthly allowance. */
  paid: boolean;
  note: string | null;
}

export interface MessageUsageDto {
  /** The month the figures are for ("2026-11"). */
  period: string;
  /** Null: the plan includes no paid messages, so SMS and WhatsApp go by e-mail. */
  allowance: number | null;
  used: number;
  remaining: number | null;
  channels: MessageChannelStateDto[];
}
