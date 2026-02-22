export interface QueueStats {
  readonly sent: number;
  readonly failed: number;
  readonly lastSeen: string;
}

export class RecoveryOperationsQueueStats {
  private sent = 0;
  private failed = 0;
  private lastSeen = new Date(0).toISOString();

  markSent(): void {
    this.sent += 1;
    this.lastSeen = new Date().toISOString();
  }

  markFailed(): void {
    this.failed += 1;
    this.lastSeen = new Date().toISOString();
  }

  read(): QueueStats {
    return {
      sent: this.sent,
      failed: this.failed,
      lastSeen: this.lastSeen,
    };
  }
}
