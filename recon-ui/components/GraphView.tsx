'use client';

import { useMemo } from 'react';

interface GraphViewProps {
  reportData: any;
}

interface GraphNode {
  id: string;
  label: string;
  type: 'company' | 'competitor' | 'investor' | 'technology' | 'person';
  x: number;
  y: number;
  radius: number;
  color: string;
  source?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
  color: string;
}

export default function GraphView({ reportData }: GraphViewProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Center node: the target company
    const companyName = reportData?.meta?.companyName || reportData?.snapshot?.website || 'Unknown';
    const centerNode: GraphNode = {
      id: 'center',
      label: companyName,
      type: 'company',
      x: 300,
      y: 300,
      radius: 40,
      color: '#06b6d4', // recon-cyan
    };
    nodes.push(centerNode);

    // Extract peripheral nodes
    const peripheralNodes: Array<{ label: string; type: GraphNode['type']; edgeLabel: string; source: string }> = [];

    // Competitors (top 5)
    try {
      if (reportData?.competitive && Array.isArray(reportData.competitive)) {
        reportData.competitive.slice(0, 5).forEach((comp: any) => {
          peripheralNodes.push({
            label: comp.competitor || comp.name || 'Unknown',
            type: 'competitor',
            edgeLabel: 'competes with',
            source: `Weakness: ${comp.weakness || 'N/A'}`,
          });
        });
      }
    } catch (e) {
      // Graceful degradation
    }

    // Investors (top 3)
    try {
      if (reportData?.financials?.investors && Array.isArray(reportData.financials.investors)) {
        reportData.financials.investors.slice(0, 3).forEach((investor: string) => {
          peripheralNodes.push({
            label: investor,
            type: 'investor',
            edgeLabel: 'invested in',
            source: `Investor from ${reportData.financials.lastRound || 'funding round'}`,
          });
        });
      }
    } catch (e) {
      // Graceful degradation
    }

    // Technologies (up to 4)
    try {
      const techList: string[] = [];
      if (reportData?.techStack) {
        if (Array.isArray(reportData.techStack)) {
          // Could be flat array or array of objects with {category, items}
          reportData.techStack.forEach((item: any) => {
            if (typeof item === 'string') {
              techList.push(item);
            } else if (item.items && Array.isArray(item.items)) {
              techList.push(...item.items);
            }
          });
        }
      }
      techList.slice(0, 4).forEach((tech: string) => {
        peripheralNodes.push({
          label: tech,
          type: 'technology',
          edgeLabel: 'uses',
          source: 'Tech stack',
        });
      });
    } catch (e) {
      // Graceful degradation
    }

    // People — extract CEO or founder if available (mock for now)
    // In person/deep modes, this could be enhanced with real data
    // For now, we gracefully skip if not present

    // Position peripheral nodes in a circle around center
    const radius = 200;
    const total = peripheralNodes.length;

    if (total === 0) {
      // No peripheral nodes — just return center node
      return { nodes, edges };
    }

    peripheralNodes.forEach((node, i) => {
      const angle = (i / total) * 2 * Math.PI;
      const x = 300 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);

      const colors: Record<GraphNode['type'], string> = {
        company: '#06b6d4', // cyan
        competitor: '#ef4444', // red
        investor: '#10b981', // green
        technology: '#f59e0b', // amber
        person: '#a855f7', // purple
      };

      const nodeId = `node-${i}`;
      nodes.push({
        id: nodeId,
        label: node.label,
        type: node.type,
        x,
        y,
        radius: 28,
        color: colors[node.type],
        source: node.source,
      });

      // Edge from center to this node
      edges.push({
        from: 'center',
        to: nodeId,
        label: node.edgeLabel,
        color: colors[node.type],
      });
    });

    return { nodes, edges };
  }, [reportData]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-recon-grey text-sm">
        No entity data available to visualize
      </div>
    );
  }

  return (
    <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
      <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Entity Relationship Graph</h3>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#06b6d4]"></div>
          <span className="text-recon-grey">Company</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
          <span className="text-recon-grey">Competitor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#10b981]"></div>
          <span className="text-recon-grey">Investor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div>
          <span className="text-recon-grey">Technology</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#a855f7]"></div>
          <span className="text-recon-grey">Person</span>
        </div>
      </div>

      {/* SVG Graph */}
      <svg viewBox="0 0 600 600" className="w-full h-auto bg-recon-dark/60 rounded border border-recon-blue/20">
        {/* Edges (draw under nodes) */}
        {edges.map((edge, i) => {
          const fromNode = nodes.find(n => n.id === edge.from);
          const toNode = nodes.find(n => n.id === edge.to);
          if (!fromNode || !toNode) return null;

          return (
            <g key={`edge-${i}`}>
              <line
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={edge.color}
                strokeWidth="1.5"
                strokeOpacity="0.4"
              />
              {/* Edge label (optional — commented out for cleaner look)
              <text
                x={(fromNode.x + toNode.x) / 2}
                y={(fromNode.y + toNode.y) / 2}
                fill="#6b7280"
                fontSize="8"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {edge.label}
              </text>
              */}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => (
          <g key={node.id}>
            {/* Node circle */}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius}
              fill={node.color}
              fillOpacity={node.type === 'company' ? 0.9 : 0.7}
              stroke={node.color}
              strokeWidth="2"
              strokeOpacity="1"
            >
              <title>{node.source || node.label}</title>
            </circle>

            {/* Node label */}
            <text
              x={node.x}
              y={node.y + node.radius + 14}
              fill="#d1d5db"
              fontSize="11"
              fontWeight={node.type === 'company' ? 'bold' : 'normal'}
              textAnchor="middle"
              className="select-none"
            >
              {/* Truncate long labels */}
              {node.label.length > 12 ? node.label.substring(0, 11) + '...' : node.label}
              <title>{node.label}{node.source ? ` — ${node.source}` : ''}</title>
            </text>
          </g>
        ))}
      </svg>

      <div className="text-recon-grey text-xs mt-3 italic">
        Hover over nodes to see details. Graph shows {nodes.length - 1} entities extracted from report.
      </div>
    </div>
  );
}
