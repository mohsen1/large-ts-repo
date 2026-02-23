import { Fragment, useMemo } from 'react';

export interface SignalCampaignListItem {
  readonly campaignId: string;
  readonly facility: string;
  readonly status: 'queued' | 'active' | 'throttled' | 'completed' | 'cancelled';
}

export interface SignalCampaignListProps {
  readonly items: readonly SignalCampaignListItem[];
  readonly onExecute?: (campaignId: string) => void;
  readonly onRefresh?: () => void;
}

const renderTag = (status: SignalCampaignListItem['status']) => {
  const tone = {
    queued: 'gray',
    active: 'green',
    throttled: 'orange',
    completed: 'blue',
    cancelled: 'red',
  };
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 72,
        textAlign: 'center',
        border: `1px solid ${tone[status]}`,
      }}
    >
      {status}
    </span>
  );
};

export const SignalCampaignList = ({ items, onExecute, onRefresh }: SignalCampaignListProps) => {
  const totals = useMemo(() => {
    const values = {
      queued: 0,
      active: 0,
      throttled: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const item of items) {
      values[item.status] += 1;
    }
    return values;
  }, [items]);

  return (
    <section>
      <header>
        <h3>Signal Campaigns</h3>
        <p>
          queued {totals.queued} active {totals.active} throttled {totals.throttled} completed {totals.completed} cancelled{' '}
          {totals.cancelled}
        </p>
        <button onClick={() => onRefresh?.()}>Refresh</button>
      </header>
      <ul>
        {items.map((item) => (
          <li key={item.campaignId}>
            <strong>{item.campaignId}</strong> / {item.facility} {' '}
            {renderTag(item.status)}
            <button onClick={() => onExecute?.(item.campaignId)}>run</button>
          </li>
        ))}
      </ul>
    </section>
  );
};
