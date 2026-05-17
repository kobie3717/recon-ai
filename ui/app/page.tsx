'use client';

import { useState, useRef } from 'react';
import Header from '@/components/Header';
import UrlInput from '@/components/UrlInput';
import Waterfall, { AgentState, AgentStatus } from '@/components/Waterfall';
import ReportPanel from '@/components/ReportPanel';
import ComparePanel from '@/components/ComparePanel';

type Mode = 'standard' | 'seo' | 'redteam' | 'deep' | 'bundle';

export default function Home() {
  const [url, setUrl] = useState('');
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
  const completedRef = useRef(false);

  // Compare mode state
  const [reportData2, setReportData2] = useState<any>(null);
  const [isRunning2, setIsRunning2] = useState(false);
  const [compareActive, setCompareActive] = useState(false);
  const [domain1Label, setDomain1Label] = useState('');
  const [domain2Label, setDomain2Label] = useState('');
  const completedRef2 = useRef(false);

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

  const handleGenerate = (url: string, mode: Mode, cost: number) => {
    if (!url.trim()) {
      alert('Please enter a company URL');
      return;
    }

    if (credits < cost) {
      alert('Insufficient credits');
      return;
    }

    const domain = extractDomain(url);

    // Reset state
    completedRef.current = false;
    setIsRunning(true);
    setCurrentMode(mode);
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

    // Connect to SSE via proxy
    const evtSource = new EventSource(
      `/api/proxy?domain=${encodeURIComponent(domain)}&mode=${mode}`
    );

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        // Agent pipeline events — backend sends { agent, status, elapsed } with no type field
        if (event.agent) {
          setAgents((prev) => {
            const existing = prev.find((a) => a.name === event.agent);
            if (existing) {
              return prev.map((a) =>
                a.name === event.agent
                  ? { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed }
                  : a
              );
            }
            return [
              ...prev,
              { name: event.agent, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0 },
            ];
          });
          if (event.elapsed) setTotalElapsed(event.elapsed);
        } else if (event.type === 'cache-hit' || event.type === 'cache_hit') {
          setCacheHit(true);
          setCacheTime(event.cache_time || event.elapsed);
          setFreshTime(event.fresh_time || 9.0);
        } else if (event.type === 'report') {
          // Final event — contains structured report data + cost breakdown
          if (typeof event.report === 'object') {
            setReportData(event.report);
            // Auto-save to backend
            fetch('/api/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ domain, report: event.report, mode }),
            }).catch(() => {});
          } else {
            // Fallback for old markdown format
            setReportContent(event.report || event.content || '');
          }
          if (event.cost) {
            setCostBreakdown(event.costBreakdown || { total: event.cost });
          }
          setIsRunning(false);
          setCredits(prev => prev - cost);
          completedRef.current = true;
          evtSource.close();
        } else if (event.type === 'complete') {
          setIsRunning(false);
          setCredits(prev => prev - cost);
          completedRef.current = true;
          evtSource.close();
        } else if (event.type === 'error') {
          console.error('Report error:', event.message);
          setIsRunning(false);
          evtSource.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    evtSource.onerror = () => {
      // Stream closing after res.end() triggers onerror — ignore if already completed
      if (!completedRef.current) {
        setIsRunning(false);
      }
      evtSource.close();
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

    // Reset state
    completedRef.current = false;
    completedRef2.current = false;
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
    setDomain1Label(domain1);
    setDomain2Label(domain2);

    // Connect to first SSE stream
    const evtSource1 = new EventSource(
      `/api/proxy?domain=${encodeURIComponent(domain1)}&mode=${mode}`
    );

    evtSource1.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.agent) {
          setAgents((prev) => {
            const agentName = `${domain1}: ${event.agent}`;
            const existing = prev.find((a) => a.name === agentName);
            if (existing) {
              return prev.map((a) =>
                a.name === agentName
                  ? { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed }
                  : a
              );
            }
            return [
              ...prev,
              { name: agentName, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0 },
            ];
          });
        } else if (event.type === 'report') {
          if (typeof event.report === 'object') {
            setReportData(event.report);
          } else {
            setReportContent(event.report || event.content || '');
          }
          setIsRunning(false);
          completedRef.current = true;
          evtSource1.close();

          // Deduct credits only when both complete
          if (completedRef2.current) {
            setCredits(prev => prev - cost);
          }
        } else if (event.type === 'complete') {
          setIsRunning(false);
          completedRef.current = true;
          evtSource1.close();

          if (completedRef2.current) {
            setCredits(prev => prev - cost);
          }
        } else if (event.type === 'error') {
          console.error('Report 1 error:', event.message);
          setIsRunning(false);
          evtSource1.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event (stream 1):', err);
      }
    };

    evtSource1.onerror = () => {
      if (!completedRef.current) {
        setIsRunning(false);
      }
      evtSource1.close();
    };

    // Connect to second SSE stream
    const evtSource2 = new EventSource(
      `/api/proxy?domain=${encodeURIComponent(domain2)}&mode=${mode}`
    );

    evtSource2.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.agent) {
          setAgents((prev) => {
            const agentName = `${domain2}: ${event.agent}`;
            const existing = prev.find((a) => a.name === agentName);
            if (existing) {
              return prev.map((a) =>
                a.name === agentName
                  ? { ...a, status: event.status as AgentStatus, elapsed: event.elapsed ?? a.elapsed }
                  : a
              );
            }
            return [
              ...prev,
              { name: agentName, status: event.status as AgentStatus, elapsed: event.elapsed ?? 0 },
            ];
          });
        } else if (event.type === 'report') {
          if (typeof event.report === 'object') {
            setReportData2(event.report);
          }
          setIsRunning2(false);
          completedRef2.current = true;
          evtSource2.close();

          // Deduct credits only when both complete
          if (completedRef.current) {
            setCredits(prev => prev - cost);
          }
        } else if (event.type === 'complete') {
          setIsRunning2(false);
          completedRef2.current = true;
          evtSource2.close();

          if (completedRef.current) {
            setCredits(prev => prev - cost);
          }
        } else if (event.type === 'error') {
          console.error('Report 2 error:', event.message);
          setIsRunning2(false);
          evtSource2.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE event (stream 2):', err);
      }
    };

    evtSource2.onerror = () => {
      if (!completedRef2.current) {
        setIsRunning2(false);
      }
      evtSource2.close();
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
        />
      </div>

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
            />
          ) : (
            <ReportPanel
              content={reportContent}
              reportData={reportData}
              costBreakdown={costBreakdown}
              isRunning={isRunning}
            />
          )}
        </div>
      </div>
    </div>
  );
}
