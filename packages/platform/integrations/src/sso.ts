export interface SsoUser {
  subject: string;
  email: string;
  groups: string[];
}

export interface SsoProvider {
  name: string;
}

export const parseToken = (token: string): Promise<SsoUser | null> => {
  try {
    const payload = Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8');
    const data = JSON.parse(payload || '{}');
    if (!data.sub || !data.email) return Promise.resolve(null);
    return Promise.resolve({ subject: data.sub, email: data.email, groups: data.groups ?? [] });
  } catch {
    return Promise.resolve(null);
  }
};

export const provider = (name: string): SsoProvider => ({ name });
