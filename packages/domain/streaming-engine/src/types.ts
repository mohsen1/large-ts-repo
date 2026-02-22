export type StreamId = string & { readonly __brand: 'stream-id' };
export type PartitionKey = string;

export interface RecordHeader {
  key: string;
  value: unknown;
  timestamp: Date;
  headers: Record<string, string>;
}

export interface StreamRecord<T = unknown> {
  id: string;
  stream: StreamId;
  partition: PartitionKey;
  value: T;
  offset: number;
  header: RecordHeader;
}

export interface StreamPartition {
  id: PartitionKey;
  startOffset: number;
  endOffset: number;
}

export interface StreamInfo {
  id: StreamId;
  partitions: StreamPartition[];
  createdAt: Date;
}

export interface Throughput {
  eventsPerSecond: number;
  bytesPerSecond: number;
}

export interface StreamMetrics {
  stream: StreamId;
  throughput: Throughput;
  lag: number;
  consumerGroups: string[];
}

export interface ConsumerRecord<T = unknown> {
  stream: StreamId;
  partition: PartitionKey;
  value: T;
  offset: number;
}

export interface ConsumerGroup {
  id: string;
  members: string[];
  committedOffsets: Map<StreamId, Map<PartitionKey, number>>;
}
