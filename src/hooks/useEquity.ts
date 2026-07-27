'use client';

/**
 * React hook around the equity Web Worker: debounces recalculation while
 * cards are being entered, streams progressive Monte Carlo results, and
 * ignores stale updates from superseded jobs.
 */

import { useEffect, useRef, useState } from 'react';
import type { Card } from '@/engine/cards';
import type { EquityResult } from '@/engine/equity';
import type { EquityJobUpdate } from '@/engine/equity.worker';

const DEBOUNCE_MS = 250;

export interface UseEquityInput {
  /** Complete hands only; caller filters out unfinished ones. */
  players: Card[][];
  /** 1 or 2 boards, each 0/3/4/5 cards. */
  boards: Card[][];
  iterations?: number;
  /** Set false to suspend calculation (e.g. invalid intermediate state). */
  enabled: boolean;
}

export interface UseEquityState {
  result: EquityResult | null;
  running: boolean;
  /** 0..1 progress of the current run (1 when exact). */
  progress: number;
}

export function useEquity(input: UseEquityInput): UseEquityState {
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef(0);
  const [state, setState] = useState<UseEquityState>({
    result: null,
    running: false,
    progress: 0,
  });

  const { players, boards, iterations, enabled } = input;
  const targetIterations = iterations ?? 20_000;

  // Key captures everything that should trigger a recalculation.
  const inputKey = JSON.stringify({ players, boards, targetIterations, enabled });

  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(() => {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('@/engine/equity.worker', import.meta.url));
      }
      const worker = workerRef.current;
      const id = ++jobIdRef.current;

      worker.onmessage = (e: MessageEvent<EquityJobUpdate>) => {
        if (e.data.id !== jobIdRef.current) return; // stale job
        const { result, done } = e.data;
        setState({
          result,
          running: !done,
          progress: done ? 1 : Math.min(result.samples / targetIterations, 1),
        });
      };

      setState((s) => ({ ...s, running: true, progress: 0 }));
      worker.postMessage({ id, options: { players, boards, iterations: targetIterations } });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  // Terminate the worker when the component unmounts.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // While disabled, keep the last result but report an idle simulation.
  return enabled ? state : { ...state, running: false, progress: 0 };
}
