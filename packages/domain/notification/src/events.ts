export interface Notification {
  to: string;
  subject: string;
  body: string;
  channel: 'email' | 'sms' | 'push';
  metadata?: Record<string, string>;
}

export interface NotificationBatch {
  id: string;
  notifications: Notification[];
}

export const mergeBatches = (left: NotificationBatch, right: NotificationBatch): NotificationBatch => ({
  id: left.id,
  notifications: [...left.notifications, ...right.notifications],
});

export const filterByChannel = (batch: NotificationBatch, channel: Notification['channel']): Notification[] =>
  batch.notifications.filter((item) => item.channel === channel);

export const hasRecipient = (batch: NotificationBatch, to: string): boolean =>
  batch.notifications.some((item) => item.to === to);
