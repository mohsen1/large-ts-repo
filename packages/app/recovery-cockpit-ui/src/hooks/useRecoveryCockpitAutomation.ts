import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Brand } from '@shared/type-level';
import {
  makeSamplePayload,
  runAutomationFromText,
  hydrateBlueprintFromText,
  buildDeck,
  type AutomationRunOverview,
  type DeckItem,
  resolveRunConfig,
} from '../services/recoveryCockpitAutomationService';

type HookState = {
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly overview: AutomationRunOverview | undefined;
  readonly deck: readonly DeckItem[];
  readonly input: string;
  readonly mode: 'observe' | 'dry-run' | 'execute';
};

type Action =
  | { readonly type: 'start' }
  | { readonly type: 'fail'; readonly error: string }
  | { readonly type: 'ready'; readonly deck: readonly DeckItem[] }
  | { readonly type: 'resolve'; readonly overview: AutomationRunOverview }
  | { readonly type: 'input'; readonly value: string }
  | { readonly type: 'mode'; readonly mode: 'observe' | 'dry-run' | 'execute' };

const initial: HookState = {
  loading: false,
  error: undefined,
  overview: undefined,
  deck: [],
  input: makeSamplePayload('recovery-automation'),
  mode: 'observe',
};

const reducer = (state: HookState, action: Action): HookState => {
  switch (action.type) {
    case 'start':
      return { ...state, loading: true, error: undefined, overview: undefined };
    case 'fail':
      return { ...state, loading: false, error: action.error };
    case 'ready':
      return { ...state, deck: action.deck, loading: false };
    case 'resolve':
      return { ...state, loading: false, overview: action.overview };
    case 'input':
      return { ...state, input: action.value };
    case 'mode':
      return { ...state, mode: action.mode };
    default:
      return state;
  }
};

export const useRecoveryCockpitAutomation = () => {
  const [state, dispatch] = useReducer(reducer, initial);
  const live = useRef<string>('');
  const [runtimeMode, setRuntimeMode] = useState<'observe' | 'dry-run' | 'execute'>(initial.mode);

  useEffect(() => {
    const parsed = hydrateBlueprintFromText(state.input);
    const deck = parsed ? buildDeck(parsed) : [];
    dispatch({ type: 'ready', deck });
  }, [state.input]);

  const run = async (): Promise<void> => {
    dispatch({ type: 'start' });
    const result = await runAutomationFromText(state.input, {
      mode: runtimeMode,
      tenant: 'tenant:automation' as Brand<string, 'Tenant'>,
      user: 'operator',
      limit: 50,
    });
    if (result) {
      dispatch({ type: 'resolve', overview: result });
      return;
    }
    dispatch({ type: 'fail', error: 'automation run failed' });
  };

  const setInput = (value: string): void => {
    live.current = value;
    dispatch({ type: 'input', value: value });
  };

  const setMode = (value: string): void => {
    dispatch({ type: 'mode', mode: resolveRunConfig(value) });
    setRuntimeMode(resolveRunConfig(value));
  };

  const resetInput = (): void => {
    dispatch({ type: 'input', value: makeSamplePayload('recovery-automation') });
  };

  return useMemo(() => ({
    ...state,
    run,
    setInput,
    setMode,
    resetInput,
    deckCount: state.deck.length,
  }), [runtimeMode, state, run]);
};
