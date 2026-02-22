export interface Template {
  name: string;
  subject: string;
  body: string;
}

export const render = (template: Template, values: Record<string, string>): NotificationContent => {
  const subject = replace(template.subject, values);
  const body = replace(template.body, values);
  return { subject, body };
};

export interface NotificationContent {
  subject: string;
  body: string;
}

const replace = (input: string, values: Record<string, string>): string =>
  input.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => values[key] ?? _match);

export const createWelcome = (): Template => ({
  name: 'welcome',
  subject: 'Welcome {name}',
  body: 'Hi {name}, welcome on board',
});

export const createAlert = (): Template => ({
  name: 'alert',
  subject: 'Alert for {name}',
  body: 'Event {event} happened at {time}',
});
