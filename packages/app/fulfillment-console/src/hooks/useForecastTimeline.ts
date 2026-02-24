import { useMemo } from 'react';

export interface TimelinePoint {
  label: string;
  value: number;
}

export interface TimelineSeries {
  title: string;
  points: readonly TimelinePoint[];
}

const toLabel = (index: number): string => `t-${index.toString().padStart(2, '0')}`;

export const useForecastTimeline = (values: readonly number[], title: string): TimelineSeries =>
  useMemo(() => ({
    title,
    points: values.map((value, index) => ({
      label: toLabel(index),
      value: Number(value.toFixed(2)),
    })),
  }), [title, values]);
