'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import UrlInput from '@/components/UrlInput';
import Waterfall, { AgentState, AgentStatus } from '@/components/Waterfall';
import ReportPanel from '@/components/ReportPanel';

type Mode = 'standard' | 'seo' | 'redteam' | 'deep' | 'bundle';

export default function Home() {
  const [url, setUrl] = useState('');
  const [credits, setCredits] = useState(198.0);
  const [isRunning, setIsRunning] = useState(false);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [reportContent, setReportContent] = useState('');
  const [cacheHit, setCacheHit] = useState(false);
  const [cacheTime, setCacheTime] = useState<number>();
  const [freshTime, setFreshTime] = useState<number>();
  const [costBreakdown, setCostBreakdown] = useState<any>();

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
    setIsRunning(true);
    setAgents([]);
    setTotalElapsed(0);
    setReportContent('');
    setCacheHit(false);
    setCacheTime(undefined);
    setFreshTime(undefined);
    setCostBreakdown(undefined);

    // Connect to SSE via proxy
    const evtSource = new EventSource(
      `/api/proxy?domain=${encodeURIComponent(domain)}&mode=${mode}`
    );

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        if (event.type === 'agent_update') {
          setAgents((prev) => {
            const existing = prev.find((a) => a.name === event.agent);
            if (existing) {
              return prev.map((a) =>
                a.name === event.agent
                  ? { ...a, status: event.status as AgentStatus, elapsed: event.elapsed || a.elapsed, message: event.message }
                  : a
              );
            } else {
              return [
                ...prev,
                { name: event.agent, status: event.status as AgentStatus, elapsed: event.elapsed || 0, message: event.message },
              ];
            }
          });

          if (event.elapsed) {
            setTotalElapsed(event.elapsed);
          }
        } else if (event.type === 'cache-hit' || event.type === 'cache_hit') {
          setCacheHit(true);
          setCacheTime(event.cache_time || event.elapsed);
          setFreshTime(event.fresh_time || 9.0);
        } else if (event.type === 'report') {
          setReportContent(event.content || event.report || '');
        } else if (event.type === 'cost') {
          setCostBreakdown({
            webUnlocker: event.web_unlocker,
            serp: event.serp,
            scrapingBrowser: event.scraping_browser,
            webScraper: event.web_scraper,
            total: event.total || cost,
          });
        } else if (event.type === 'complete') {
          setIsRunning(false);
          setCredits(prev => prev - cost);
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

    evtSource.onerror = (err) => {
      console.error('SSE error:', err);
      setIsRunning(false);
      evtSource.close();
    };
  };

  return (
    <div className="flex flex-col h-screen">
      <Header credits={credits} />

      <UrlInput
        onGenerate={handleGenerate}
        isRunning={isRunning}
        url={url}
        onUrlChange={setUrl}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 h-full">
          <Waterfall
            agents={agents}
            totalElapsed={totalElapsed}
            cacheHit={cacheHit}
            cacheTime={cacheTime}
            freshTime={freshTime}
            isRunning={isRunning}
          />
        </div>
        <div className="w-1/2 h-full">
          <ReportPanel
            content={reportContent}
            costBreakdown={costBreakdown}
            isRunning={isRunning}
          />
        </div>
      </div>
    </div>
  );
}
