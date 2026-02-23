import { useMemo, useState, useCallback } from 'react';
import type { CommandLabFilterMode, CommandLabCommandTile } from '../types/recoveryCommandLab';

export interface UseCommandLabFiltersInput {
  readonly records: readonly CommandLabCommandTile[];
  readonly search: string;
}

export interface UseCommandLabFiltersOutput {
  readonly filtered: readonly CommandLabCommandTile[];
  readonly hasCritical: boolean;
  readonly setMode: (mode: CommandLabFilterMode) => void;
}

export const useCommandLabFilters = ({
  records,
  search,
}: UseCommandLabFiltersInput): [CommandLabFilterMode, UseCommandLabFiltersOutput] => {
  const [mode, setMode] = useState<CommandLabFilterMode>('all');

  const hasCritical = records.some((record) => record.state === 'critical');

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return records.filter((record) => {
      const modeMatch = mode === 'all' || record.state === mode;
      if (!modeMatch) return false;
      if (!normalized) return true;
      return record.title.toLowerCase().includes(normalized) || record.commandId.toLowerCase().includes(normalized);
    });
  }, [records, search, mode]);

  const setFilterMode = useCallback((next: CommandLabFilterMode) => {
    setMode(next);
  }, []);

  return [
    mode,
    {
      filtered,
      hasCritical,
      setMode: setFilterMode,
    },
  ];
};
