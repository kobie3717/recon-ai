'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '@/components/Header';
import UrlInput from '@/components/UrlInput';
import Waterfall, { AgentState, AgentStatus } from '@/components/Waterfall';
import ReportPanel from '@/components/ReportPanel';
import ComparePanel from '@/components/ComparePanel';
import RedteamPanel from '@/components/RedteamPanel';
import SeoPanel from '@/components/SeoPanel';
import BundlePanel from '@/components/BundlePanel';
import PersonPanel from '@/components/PersonPanel';

type Mode = 'standard' | 'seo' | 'redteam' | 'deep' | 'bundle' | 'person';

export default function Home() {
  const [url, setUrl] = useState('');
  const [url2, setUrl2] = useState('');
  const [credits, setCredits] = useState(198.0);
  const [isRunning, setIsRunning] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [reportContent, setReportContent] = useState('');
  const [reportData, setReportData] = useState<any>(null);
  const [currentMode, setCurrentMode] = useState<Mode>('standard');
  const [cacheHit, setCacheHit] = useState(false);
  const [cacheTime, setCacheTime] = useState<number>();
  const [freshTime, setFreshTime] = useState<number>();
  const [costBreakdown, setCostBreakdown] = useState<any>();
  const [errorMessage, setErrorMessage] = useState<string>('');
  const completedRef = useRef(false);
  const cacheHitRef = useRef(false);

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  // Compare mode state
  const [reportData2, setReportData2] = useState<any>(null);
  const [isRunning2, setIsRunning2] = useState(false);
  const [compareActive, setCompareActive] = useState(false);
  const [compareInputOpen, setCompareInputOpen] = useState(false);
  const completedRef2 = useRef(false);
  const creditDeductedRef = useRef(false);
  const [compareDomain1, setCompareDomain1] = useState('');
  const [compareDomain2, setCompareDomain2] = useState('');

  // History state
  const [history, setHistory] = useState<Array<{domain: string, mode: string, report: any, savedAt: string}>>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('recon:history') || '[]');
      setHistory(saved);
    } catch (e) {
      console.warn('[history] localStorage read failed:', e);
      setHistory([]);
    }
  }, []);

  const extractDomain = (input: string): string => {
    try {
      let urlStr = input.trim();
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        urlStr = 'https://' + urlStr;
      }
      const url = new URL(urlStr);
      let domain = url.hostname;
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }
      return domain;
    } catch {
      return input.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
  };

  const saveToHistory = (domain: string, mode: string, report: any) => {
    try {
      const key = 'recon:history';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const entry = { domain, mode, report, savedAt: new Date().toISOString() };
      const filtered = existing.filter((e: any) => !(e.domain === domain && e.mode === mode));
      const updated = [entry, ...filtered].slice(0, 20);
      localStorage.setItem(key, JSON.stringify(updated));
      setHistory(updated);
    } catch (e) {
      console.warn('[history] save failed:', e);
    }
  };

  const handleGenerate = (url: string, mode: Mode, cost: number) => {
    if (!url.trim()) {
      alert('Please enter a company URL');
      return;
    }

    if (credits < cost) {
      alert('Insufficient credits');
      return;
    }

    // Auto-detect person names — if input has spaces but no dots, switch to person mode
    const looksLikePerson = /^[a-zA-Z\s'-]{2,100}$/.test(url.trim()) && !url.includes('.');
    const effectiveMode: Mode = looksLikePerson ? 'person' : mode;
    const domain = effectiveMode === 'person' ? url.trim() : extractDomain(url);

    // Reset state
    completedRef.current = false;
    cacheHitRef.current = false;
    setIsRunning(true);
    setCurrentMode(effectiveMode);
    setAgents([]);
    setTotalElapsed(0);
    setReportContent('');
    setReportData(null);
    setCacheHit(false);
    setCacheTime(undefined);
    setFreshTime(undefined);
    setCostBreakdown(undefined);
    setCompareActive(false);
    setReportData2(null);
    setErrorMessage('');

    // Connect to SSE via direct Railway URL (bypass Vercel 10s timeout)
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://powerful-mindfulness-production-56ff.up.railway.app';
    const evtSource = new EventSource(
      `${backendUrl}/api/report?domain=${encodeURIComponent(domain)}&mode=${effectiveMode}`
    );

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        // Agent pipeline events — backend sends { agent, status, elapsed } with no type field
        if (event.agent) {
          setAgents((prev) => {
            let found = false;
            const next = prev.map((a) => {
              if (a.name !== event.agent) return a;
              found = true;
              return { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed };
            });
            return found ? next : [...next, { name: event.agent, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0 }];
          });
          if (event.elapsed) setTotalElapsed(event.elapsed);
        } else if (event.type === 'cache-hit' || event.type === 'cache_hit') {
          setCacheHit(true);
          cacheHitRef.current = true;
          setCacheTime(event.cache_time || event.elapsed);
          setFreshTime(event.fresh_time || 9.0);
          // Cache hit — don't deduct credits, stream still sends report event
        } else if (event.type === 'report') {
          completedRef.current = true; // set first — onerror debounce checks this
          if (typeof event.report === 'object') {
            setReportData(event.report);
            saveToHistory(domain, mode, event.report);
            fetch('/api/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, report: event.report, mode }),
            }).catch(() => {});
          } else {
            setReportContent(event.report || event.content || '');
          }
          if (event.cost) {
            setCostBreakdown(event.costBreakdown || { total: event.cost });
          }
          setIsRunning(false);
          if (!cacheHitRef.current) setCredits(prev => prev - cost);
          evtSource.close();
        } else if (event.type === 'complete') {
          setIsRunning(false);
          if (!cacheHitRef.current) setCredits(prev => prev - cost);
          completedRef.current = true;
          evtSource.close();
        } else if (event.type === 'error') {
          setErrorMessage(event.message || 'Report generation failed');
          setTimeout(() => setErrorMessage(''), 8000);
          setIsRunning(false);
          evtSource.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    evtSource.onerror = () => {
      // Debounce: server close fires onerror even on clean completion — wait for onmessage first
      setTimeout(() => {
        if (!completedRef.current) {
          setIsRunning(false);
          setErrorMessage('Connection lost — please try again');
          setTimeout(() => setErrorMessage(''), 8000);
        }
        evtSource.close();
      }, 500);
    };
  };

  const handleCompare = (urlA: string, urlB: string, mode: 'standard' | 'deep') => {
    if (!urlA.trim() || !urlB.trim()) {
      alert('Please enter both company URLs');
      return;
    }

    const cost = mode === 'standard' ? 4.0 : 30.0;

    if (credits < cost) {
      alert('Insufficient credits');
      return;
    }

    const domain1 = extractDomain(urlA);
    const domain2 = extractDomain(urlB);

    if (domain1 === domain2) {
      alert('Please enter two different company URLs');
      return;
    }

    setCompareDomain1(domain1);
    setCompareDomain2(domain2);

    // Reset state
    completedRef.current = false;
    completedRef2.current = false;
    creditDeductedRef.current = false;
    setIsRunning(true);
    setIsRunning2(true);
    setCompareActive(true);
    setCurrentMode(mode);
    setAgents([]);
    setTotalElapsed(0);
    setReportContent('');
    setReportData(null);
    setReportData2(null);
    setCacheHit(false);
    setCacheTime(undefined);
    setFreshTime(undefined);
    setCostBreakdown(undefined);
    // Connect to first SSE stream (direct to Railway)
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://powerful-mindfulness-production-56ff.up.railway.app';
    const evtSource1 = new EventSource(
      `${backendUrl}/api/report?domain=${encodeURIComponent(domain1)}&mode=${mode}`
    );

    evtSource1.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.agent) {
          setAgents((prev) => {
            const agentName = `${domain1}: ${event.agent}`;
            let found = false;
            const next = prev.map((a) => {
              if (a.name !== agentName) return a;
              found = true;
              return { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed };
            });
            return found ? next : [...next, { name: agentName, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0 }];
          });
        } else if (event.type === 'report') {
          if (typeof event.report === 'object') {
            setReportData(event.report);
            saveToHistory(domain1, `compare-${mode}`, event.report);
          } else {
            setReportContent(event.report || event.content || '');
          }
          setIsRunning(false);
          completedRef.current = true;
          evtSource1.close();

          // Deduct credits only when both complete
          if (completedRef.current && completedRef2.current && !creditDeductedRef.current) {
            creditDeductedRef.current = true;
            setCredits(prev => prev - cost);
          }
        } else if (event.type === 'complete') {
          setIsRunning(false);
          completedRef.current = true;
          evtSource1.close();

          if (completedRef.current && completedRef2.current && !creditDeductedRef.current) {
            creditDeductedRef.current = true;
            setCredits(prev => prev - cost);
          }
        } else if (event.type === 'error') {
          console.error('Report 1 error:', event.message);
          setErrorMessage(event.message || 'Report 1 failed');
          setTimeout(() => setErrorMessage(''), 8000);
          setIsRunning(false);
          evtSource1.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event (stream 1):', err);
      }
    };

    evtSource1.onerror = () => {
      setTimeout(() => {
        if (!completedRef.current) {
          setIsRunning(false);
          setErrorMessage('Connection lost — please try again');
          setTimeout(() => setErrorMessage(''), 8000);
        }
        evtSource1.close();
      }, 500);
    };

    // Connect to second SSE stream (direct to Railway)
    const evtSource2 = new EventSource(
      `${backendUrl}/api/report?domain=${encodeURIComponent(domain2)}&mode=${mode}`
    );

    evtSource2.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.agent) {
          setAgents((prev) => {
            const agentName = `${domain2}: ${event.agent}`;
            let found = false;
            const next = prev.map((a) => {
              if (a.name !== agentName) return a;
              found = true;
              return { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed };
            });
            return found ? next : [...next, { name: agentName, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0 }];
          });
        } else if (event.type === 'report') {
          if (typeof event.report === 'object') {
            setReportData2(event.report);
            saveToHistory(domain2, `compare-${mode}`, event.report);
          }
          setIsRunning2(false);
          completedRef2.current = true;
          evtSource2.close();

          // Deduct credits only when both complete
          if (completedRef.current && completedRef2.current && !creditDeductedRef.current) {
            creditDeductedRef.current = true;
            setCredits(prev => prev - cost);
          }
        } else if (event.type === 'complete') {
          setIsRunning2(false);
          completedRef2.current = true;
          evtSource2.close();

          if (completedRef.current && completedRef2.current && !creditDeductedRef.current) {
            creditDeductedRef.current = true;
            setCredits(prev => prev - cost);
          }
        } else if (event.type === 'error') {
          console.error('Report 2 error:', event.message);
          setErrorMessage(event.message || 'Report 2 failed');
          setTimeout(() => setErrorMessage(''), 8000);
          setIsRunning2(false);
          evtSource2.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event (stream 2):', err);
      }
    };

    evtSource2.onerror = () => {
      setTimeout(() => {
        if (!completedRef2.current) {
          setIsRunning2(false);
          setErrorMessage('Connection lost — please try again');
          setTimeout(() => setErrorMessage(''), 8000);
        }
        evtSource2.close();
      }, 500);
    };
  };

  return (
    <div className="flex flex-col h-screen">
      <div id="recon-header"><Header credits={credits} /></div>

      <div id="url-input-bar">
        <UrlInput
          onGenerate={handleGenerate}
          onCompare={handleCompare}
          isRunning={isRunning || isRunning2}
          url={url}
          onUrlChange={setUrl}
          url2={url2}
          onUrl2Change={setUrl2}
          onCompareToggle={setCompareInputOpen}
        />
      </div>

      {history.length > 0 && (
        <div className="relative">
          <div className="bg-recon-navy/60 border-b border-recon-blue/20 px-6 py-2 flex items-center gap-3">
            <button
              onClick={() => setShowHistory(h => !h)}
              aria-expanded={showHistory}
              className="text-recon-grey hover:text-recon-cyan text-xs flex items-center gap-1.5 transition-colors"
            >
              ⏱ {history.length} saved report{history.length !== 1 ? 's' : ''} {showHistory ? '▲' : '▼'}
            </button>
          </div>
          {showHistory && (
            <div className="absolute top-full left-0 right-0 z-50 bg-recon-navy border-b border-recon-blue/30 shadow-xl max-h-64 overflow-y-auto">
              {history.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentMode(entry.mode as Mode);
                    setReportData(entry.report);
                    setUrl(entry.domain);
                    setShowHistory(false);
                    setCompareActive(false);
                    setReportData2(null);
                    setIsRunning(false);
                    setIsRunning2(false);
                    setErrorMessage('');
                  }}
                  className="w-full text-left px-6 py-3 hover:bg-recon-blue/10 border-b border-recon-blue/10 flex items-center justify-between group"
                >
                  <div>
                    <span className="text-white text-sm font-medium">{entry.domain}</span>
                    <span className="text-recon-grey text-xs ml-2 uppercase">{entry.mode}</span>
                  </div>
                  <span className="text-recon-grey/60 text-xs">{relativeTime(entry.savedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-2 flex items-center justify-between text-sm">
          <span className="text-red-400">⚠ {errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="text-red-400/60 hover:text-red-400 ml-4">✕</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 h-full" id="waterfall-panel">
          <Waterfall
            agents={agents}
            totalElapsed={totalElapsed}
            cacheHit={cacheHit}
            cacheTime={cacheTime}
            freshTime={freshTime}
            isRunning={isRunning || isRunning2}
            mode={currentMode}
          />
        </div>
        <div className="w-1/2 h-full">
          {compareActive && (reportData || isRunning || reportData2 || isRunning2) ? (
            <ComparePanel
              report1={reportData}
              report2={reportData2}
              isLoading1={isRunning}
              isLoading2={isRunning2}
              domain1={compareDomain1}
              domain2={compareDomain2}
            />
          ) : currentMode === 'seo' ? (
            <SeoPanel
              reportData={reportData}
              isRunning={isRunning}
              onDrillDown={(q) => {
                if ((compareInputOpen || compareActive) && url.trim()) {
                  setUrl2(q);
                } else {
                  setUrl(q);
                }
              }}
            />
          ) : currentMode === 'redteam' ? (
            <RedteamPanel
              reportData={reportData}
              isRunning={isRunning}
              onDrillDown={(q) => {
                if ((compareInputOpen || compareActive) && url.trim()) {
                  setUrl2(q);
                } else {
                  setUrl(q);
                }
              }}
            />
          ) : currentMode === 'bundle' ? (
            <BundlePanel
              reportData={reportData}
              isRunning={isRunning}
              onDrillDown={(q) => {
                if ((compareInputOpen || compareActive) && url.trim()) {
                  setUrl2(q);
                } else {
                  setUrl(q);
                }
              }}
            />
          ) : currentMode === 'person' ? (
            <PersonPanel
              reportData={reportData}
              isRunning={isRunning}
              onDrillDown={(q) => {
                if ((compareInputOpen || compareActive) && url.trim()) {
                  setUrl2(q);
                } else {
                  setUrl(q);
                }
              }}
            />
          ) : (
            <ReportPanel
              content={reportContent}
              reportData={reportData}
              costBreakdown={costBreakdown}
              isRunning={isRunning}
              onDrillDown={(q) => {
                if ((compareInputOpen || compareActive) && url.trim()) {
                  setUrl2(q);
                } else {
                  setUrl(q);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
