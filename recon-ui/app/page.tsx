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
import FootprintPanel from '@/components/FootprintPanel';
import WatchPanel from '@/components/WatchPanel';
import LookupPanel from '@/components/LookupPanel';
import McpPanel from '@/components/McpPanel';
import { flattenEvidence } from '@/lib/flatten-evidence';

type Mode = 'standard' | 'seo' | 'redteam' | 'deep' | 'bundle' | 'person' | 'footprint' | 'watch' | 'lookup' | 'mcp' | 'agentic';

export default function Home() {
  const [url, setUrl] = useState('');
  const [url2, setUrl2] = useState('');
  const [credits, setCredits] = useState(198.0);
  const [isRunning, setIsRunning] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const runStartRef = useRef<number | null>(null);
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
  const [isWatching, setIsWatching] = useState(false);
  const evtSourceRef = useRef<EventSource | null>(null);
  const [synthesisText, setSynthesisText] = useState<string>('');
  const [synthesisTokens, setSynthesisTokens] = useState<number>(0);
  const [livePreview, setLivePreview] = useState<string>('');
  const isJsonPhaseRef = useRef<boolean>(false);

  // Mobile tab state - default to 'feed' for better visual proof of parallelism
  const [mobileTab, setMobileTab] = useState<'feed' | 'report'>('feed');

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

  // Live timer — ticks every 200ms while any scan is running, so totalElapsed updates
  // smoothly between SSE events. Without this, the timer freezes between agent events.
  useEffect(() => {
    if (!isRunning && !isRunning2) return;
    if (runStartRef.current == null) runStartRef.current = Date.now();
    const id = setInterval(() => {
      if (runStartRef.current == null) return;
      setTotalElapsed((Date.now() - runStartRef.current) / 1000);
    }, 200);
    return () => clearInterval(id);
  }, [isRunning, isRunning2]);

  // Compare-side 2 streaming state (mirror of synthesisText/Tokens/livePreview)
  const [synthesisText2, setSynthesisText2] = useState<string>('');
  const [synthesisTokens2, setSynthesisTokens2] = useState<number>(0);
  const [livePreview2, setLivePreview2] = useState<string>('');
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

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isRunning || isRunning2) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isRunning, isRunning2]);

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

    // Watch mode special handling
    if (mode === 'watch') {
      setIsWatching(true);
      setCurrentMode('watch');
      setIsRunning(false);
      setCompareActive(false);
      setReportData(null);
      setReportData2(null);
      setErrorMessage('');
      return;
    }

    // Reset state
    completedRef.current = false;
    cacheHitRef.current = false;
    runStartRef.current = Date.now();
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
    setIsWatching(false);
    setSynthesisText('');
    setSynthesisTokens(0);
    setLivePreview('');
    isJsonPhaseRef.current = false;

    // Connect to SSE via direct Railway URL (bypass Vercel 10s timeout)
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://recon.whatshubb.co.za';
    const evtSource = new EventSource(
      `${backendUrl}/api/report?domain=${encodeURIComponent(domain)}&mode=${effectiveMode}`
    );
    evtSourceRef.current = evtSource;

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        // Agent pipeline events — backend sends { agent, status, elapsed } with no type field
        if (event.agent) {
          // Handle json-start event
          if (event.agent === 'claude' && event.status === 'json-start') {
            isJsonPhaseRef.current = true;
          }

          // Handle streaming synthesis deltas
          if (event.agent === 'claude' && event.status === 'streaming' && event.delta) {
            // Standard mode: route markdown to livePreview, JSON to synthesisText
            if (effectiveMode === 'standard' && !isJsonPhaseRef.current) {
              setLivePreview(prev => prev + event.delta);
            } else {
              setSynthesisText(prev => prev + event.delta);
            }
            if (event.tokens) setSynthesisTokens(event.tokens);
          }

          setAgents((prev) => {
            const { agent: _a, status, elapsed, message, type: _t, ...rest } = event;
            const extra = Object.keys(rest).length > 0 ? rest : undefined;
            let found = false;
            const next = prev.map((a) => {
              if (a.name !== event.agent) return a;
              found = true;
              return { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed, message: event.message, extra };
            });
            return found ? next : [...next, { name: event.agent, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0, message: event.message, extra }];
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
            const flattened = flattenEvidence(event.report);
            setReportData(flattened);
            saveToHistory(domain, mode, flattened);
            fetch('/api/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, report: flattened, mode }),
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
    runStartRef.current = Date.now();
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
    // Reset streaming state for both sides
    setSynthesisText(''); setSynthesisTokens(0); setLivePreview('');
    setSynthesisText2(''); setSynthesisTokens2(0); setLivePreview2('');
    // Connect to first SSE stream (direct to Railway)
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://recon.whatshubb.co.za';
    const evtSource1 = new EventSource(
      `${backendUrl}/api/report?domain=${encodeURIComponent(domain1)}&mode=${mode}`
    );

    evtSource1.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.agent) {
          setAgents((prev) => {
            const { agent: _a, status, elapsed, message, type: _t, ...rest } = event;
            const extra = Object.keys(rest).length > 0 ? rest : undefined;
            const agentName = `${domain1}: ${event.agent}`;
            let found = false;
            const next = prev.map((a) => {
              if (a.name !== agentName) return a;
              found = true;
              return { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed, message: event.message, extra };
            });
            return found ? next : [...next, { name: agentName, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0, message: event.message, extra }];
          });
        } else if (event.type === 'report') {
          if (typeof event.report === 'object') {
            const flattened = flattenEvidence(event.report);
            setReportData(flattened);
            saveToHistory(domain1, `compare-${mode}`, flattened);
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
          // Handle streaming synthesis deltas for side 2
          if (event.agent === 'claude' && event.status === 'streaming' && event.delta) {
            if (mode === 'standard') {
              setLivePreview2(prev => prev + event.delta);
            } else {
              setSynthesisText2(prev => prev + event.delta);
            }
            if (event.tokens) setSynthesisTokens2(event.tokens);
          }

          setAgents((prev) => {
            const { agent: _a, status, elapsed, message, type: _t, ...rest } = event;
            const extra = Object.keys(rest).length > 0 ? rest : undefined;
            const agentName = `${domain2}: ${event.agent}`;
            let found = false;
            const next = prev.map((a) => {
              if (a.name !== agentName) return a;
              found = true;
              return { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed, message: event.message, extra };
            });
            return found ? next : [...next, { name: agentName, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0, message: event.message, extra }];
          });
        } else if (event.type === 'report') {
          if (typeof event.report === 'object') {
            const flattened = flattenEvidence(event.report);
            setReportData2(flattened);
            saveToHistory(domain2, `compare-${mode}`, flattened);
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

      {/* Hero pitch - shown when no scan is running and no results */}
      {!isRunning && !isRunning2 && !reportData && !isWatching && agents.length === 0 && (
        <div className="bg-gradient-to-r from-recon-navy via-recon-dark to-recon-navy border-b border-recon-blue/20 py-6 px-6 text-center">
          <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 animate-pulse">
            🚀 10 Bright Data Products · 4-10 Agents in Parallel · Real-Time Intelligence
          </div>
          <div className="text-recon-grey text-sm mt-2">
            Competitive intel powered by Web Unlocker · SERP API · Scraping Browser · Discover · Crawl · Web Scraper · Datasets · MCP
          </div>
        </div>
      )}

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
                    if (isRunning || isRunning2) {
                      // Scan in progress — just close dropdown, don't interrupt
                      setShowHistory(false);
                      return;
                    }
                    setCurrentMode(entry.mode as Mode);
                    setReportData(flattenEvidence(entry.report));
                    setUrl(entry.domain);
                    setShowHistory(false);
                    setCompareActive(false);
                    setReportData2(null);
                    setErrorMessage('');
                  }}
                  className={`w-full text-left px-6 py-3 hover:bg-recon-blue/10 border-b border-recon-blue/10 flex items-center justify-between group ${
                    isRunning || isRunning2 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  title={isRunning || isRunning2 ? 'Scan in progress' : ''}
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

      {/* Mobile tab switcher */}
      <div className="md:hidden bg-recon-navy border-b border-recon-blue/20 flex">
        <button
          onClick={() => setMobileTab('feed')}
          className={`flex-1 py-3 text-sm font-semibold uppercase tracking-wider transition-colors ${
            mobileTab === 'feed'
              ? 'text-recon-cyan border-b-2 border-recon-cyan'
              : 'text-recon-grey hover:text-white'
          }`}
        >
          Operative Feed
        </button>
        <button
          onClick={() => setMobileTab('report')}
          className={`flex-1 py-3 text-sm font-semibold uppercase tracking-wider transition-colors ${
            mobileTab === 'report'
              ? 'text-recon-cyan border-b-2 border-recon-cyan'
              : 'text-recon-grey hover:text-white'
          }`}
        >
          Report
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`${mobileTab === 'feed' ? 'block' : 'hidden'} md:block md:w-1/2 h-full w-full`} id="waterfall-panel">
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
        <div className={`${mobileTab === 'report' ? 'block' : 'hidden'} md:block w-full md:w-1/2 h-full`}>
          {compareActive && (reportData || isRunning || reportData2 || isRunning2) ? (
            <ComparePanel
              report1={reportData}
              report2={reportData2}
              isLoading1={isRunning}
              isLoading2={isRunning2}
              domain1={compareDomain1}
              domain2={compareDomain2}
              synthesisText1={synthesisText}
              synthesisTokens1={synthesisTokens}
              livePreview1={livePreview}
              synthesisText2={synthesisText2}
              synthesisTokens2={synthesisTokens2}
              livePreview2={livePreview2}
              isJsonPhase={isJsonPhaseRef.current}
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
          ) : currentMode === 'footprint' ? (
            <FootprintPanel
              reportData={reportData}
              isRunning={isRunning}
              onDrillDown={(q) => setUrl(q)}
            />
          ) : currentMode === 'lookup' ? (
            <LookupPanel
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
          ) : currentMode === 'mcp' ? (
            <McpPanel
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
          ) : currentMode === 'watch' ? (
            <WatchPanel
              domain={extractDomain(url)}
              isWatching={isWatching}
              onStop={() => { setIsWatching(false); setIsRunning(false); }}
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
              synthesisText={synthesisText}
              synthesisTokens={synthesisTokens}
              livePreview={livePreview}
              isJsonPhase={isJsonPhaseRef.current}
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
