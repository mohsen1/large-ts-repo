import { Credentials, Provider } from '@aws-sdk/types';
import { fromEnv } from '@aws-sdk/credential-provider-env';
import { fromIni } from '@aws-sdk/credential-provider-ini';

export type Region = string;
import { createHash } from 'crypto';

export interface AwsClientOptions {
  region?: Region;
  endpoint?: string;
  profile?: string;
  credentials?: Credentials | Provider<Credentials>;
}

export interface AwsMetadata {
  region: Region;
  accountId: string;
  partition: 'aws' | 'aws-cn' | 'aws-us-gov';
  callerArn: string;
}

export function normalizeRegion(region: string | undefined, fallback: Region = 'us-east-1'): Region {
  return (region?.trim().toLowerCase() as Region) || fallback;
}

export function defaultCredentials(profile?: string): Provider<Credentials> {
  if (profile && profile.length > 0) {
    return fromIni({ profile });
  }
  return fromEnv();
}

export function accountFingerprint(accountId: string): string {
  const normalized = accountId.trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

export function isGovCloud(region: string): boolean {
  return region.startsWith('us-gov-') || region.startsWith('aws-us-gov');
}

export function detectPartition(region: string): AwsMetadata['partition'] {
  if (region.startsWith('cn-')) return 'aws-cn';
  if (region.startsWith('us-gov-')) return 'aws-us-gov';
  return 'aws';
}

export async function resolveMetadata(options: AwsClientOptions): Promise<AwsMetadata> {
  const region = normalizeRegion(options.region ?? process.env.AWS_REGION, 'us-east-1');
  const partition = detectPartition(region);
  const accountId =
    process.env.AWS_ACCOUNT_ID ?? '000000000000';
  const callerArn =
    process.env.AWS_ROLE_ARN ?? `arn:${partition}:sts::${accountId}:assumed-role/unknown`;
  return { region, partition, accountId, callerArn };
}

export function buildTracingHeader(metadata: AwsMetadata): string {
  return [metadata.region, metadata.partition, accountFingerprint(metadata.accountId)].join(':');
}

export function validateCredentialsOption(option: AwsClientOptions): void {
  if (option.credentials && option.endpoint && option.endpoint.length > 512) {
    throw new Error('Endpoint too long');
  }
}
