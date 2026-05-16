import { useState, useCallback, useEffect, useRef } from 'react';

export interface ReconEvent {
  id: string;
  timestamp: number;
  type: string;
  agent: string;
  status: 'fetching' | 'complete' | 'error' | 'routing';
  message: string;
  elapsed?: number;
  metadata?: Record<string, any>;
}

interface ReconState {
  events: ReconEvent[];
  report: string | null;
  running: boolean;
  elapsed: number;
  cost: number | null;
  error: string | null;
}

export function useReconSSE() {
  const [state, setState] = useState<ReconState>({
    events: [],
    report: null,
    running: false,
    elapsed: 0,
    cost: null,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setState(prev => ({ ...prev, elapsed }));
    }, 100);
  }, [stopTimer]);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    stopTimer();
  }, [stopTimer]);

  const startReport = useCallback((domain: string, mode: string) => {
    cleanup();

    setState({
      events: [],
      report: null,
      running: true,
      elapsed: 0,
      cost: null,
      error: null,
    });

    startTimer();

    const url = `/api/proxy?domain=${encodeURIComponent(domain)}&mode=${encodeURIComponent(mode)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === 'report') {
          setState(prev => ({
            ...prev,
            report: data.report,
            running: false,
            cost: data.cost || null,
          }));
          stopTimer();
          cleanup();
        } else if (data.type === 'error') {
          setState(prev => ({
            ...prev,
            error: data.message || 'An error occurred',
            running: false,
          }));
          stopTimer();
          cleanup();
        } else if (data.type === 'complete') {
          setState(prev => ({
            ...prev,
            running: false,
          }));
          stopTimer();
          cleanup();
        } else {
          // Regular event
          const event: ReconEvent = {
            id: `${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            type: data.type || 'unknown',
            agent: data.agent || 'unknown',
            status: data.status || 'fetching',
            message: data.message || '',
            elapsed: data.elapsed,
            metadata: data.metadata,
          };

          setState(prev => ({
            ...prev,
            events: [...prev.events, event],
          }));
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      setState(prev => ({
        ...prev,
        error: 'Connection error',
        running: false,
      }));
      stopTimer();
      cleanup();
    };
  }, [cleanup, startTimer, stopTimer]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    ...state,
    startReport,
  };
}
