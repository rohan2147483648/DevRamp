import React, { useMemo, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search } from 'lucide-react';
import { GraphData } from '../services/api';

// Custom Node component for visualization
const CustomCodeNode = ({ data }: any) => {
  const isClass = data.type === 'class';
  const isFunction = data.type === 'function' || data.type === 'method';
  const isImport = data.type === 'import';

  let typeColor = 'bg-zinc-800/80 border-zinc-700 text-zinc-300';
  if (isClass) typeColor = 'bg-orange-950/40 border-orange-500/70 text-orange-200';
  if (isFunction) typeColor = 'bg-zinc-900 border-zinc-500 text-zinc-200';
  if (isImport) typeColor = 'bg-zinc-950 border-orange-800/60 text-orange-300/80';

  const opacityClass = data.classNameOverride || 'opacity-100';

  return (
    <div className={`px-4 py-2.5 rounded-lg border shadow-lg glass-card ${typeColor} ${opacityClass} text-left min-w-[160px] transition-all duration-300`}>
      <Handle type="target" position={Position.Top} className="bg-orange-500 w-2.5 h-2.5 border-none" />
      <div className="text-[9px] uppercase font-bold tracking-wider opacity-60 mb-0.5">{data.type}</div>
      <div className="font-bold text-xs truncate">{data.label}</div>
      <div className="text-[9px] truncate opacity-40 font-mono mt-1">{data.filePath}</div>
      <Handle type="source" position={Position.Bottom} className="bg-orange-500 w-2.5 h-2.5 border-none" />
    </div>
  );
};

interface VisualizerProps {
  graphData: GraphData | null;
  highlightedNodeIds: string[];
}

function VisualizerContent({ graphData, highlightedNodeIds }: VisualizerProps) {
  const nodeTypes = useMemo(() => ({ codeNode: CustomCodeNode }), []);
  const { setCenter, zoomTo, fitBounds } = useReactFlow();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Get unique directories from graphData
  const folderOptions = useMemo(() => {
    if (!graphData) return [];
    const dirs = new Set<string>();
    graphData.nodes.forEach(n => {
      const filePath = n.data.filePath;
      if (filePath) {
        const parts = filePath.split('/');
        if (parts.length > 1) {
          // Add parent directory path
          dirs.add(parts.slice(0, -1).join('/'));
        } else {
          dirs.add('./'); // Root folder
        }
      }
    });
    return Array.from(dirs).sort();
  }, [graphData]);

  const [selectedFolder, setSelectedFolder] = useState<string>('');

  // Compute layout or position dynamically if not present
  const flowNodes = useMemo(() => {
    if (!graphData) return [];
    
    return graphData.nodes.map((node, index) => {
      const isHighlighted = highlightedNodeIds.includes(node.id);
      
      // Determine if this node belongs to the selected folder scope
      const nodeFolder = node.data.filePath && node.data.filePath.includes('/')
        ? node.data.filePath.split('/').slice(0, -1).join('/')
        : './';
      
      const matchesFolder = !selectedFolder || nodeFolder.startsWith(selectedFolder);

      // Calculate non-overlapping grid layout coords
      // Widened spacing to guarantee zero overlaps even with long labels
      const colWidth = 360;
      const rowHeight = 200;
      const columnsCount = 3;
      
      const col = index % columnsCount;
      const row = Math.floor(index / columnsCount);
      
      const x = col * colWidth + 80;
      const y = row * rowHeight + 80;

      // Base styles with graying out filter if folder is selected and doesn't match
      const opacityStyle = matchesFolder ? 'opacity-100' : 'opacity-20 grayscale brightness-[0.35]';

      return {
        id: node.id,
        type: node.type,
        data: {
          ...node.data,
          // Propagate opacity style override into data so CustomCodeNode can apply it
          classNameOverride: opacityStyle
        },
        position: { x, y },
        style: isHighlighted ? {
          boxShadow: '0 0 22px 5px rgba(249, 115, 22, 0.45)',
          borderRadius: '8px',
          border: '1.5px solid #f97316',
          transition: 'all 0.3s ease'
        } : {
          transition: 'all 0.3s ease'
        }
      };
    });
  }, [graphData, highlightedNodeIds, selectedFolder]);

  const flowEdges = useMemo(() => {
    if (!graphData) return [];
    return graphData.edges.map(edge => {
      const isSrcHighlighted = highlightedNodeIds.includes(edge.source);
      const isTgtHighlighted = highlightedNodeIds.includes(edge.target);
      
      // Get source and target node folders
      const srcNode = graphData.nodes.find(n => n.id === edge.source);
      const tgtNode = graphData.nodes.find(n => n.id === edge.target);
      
      const srcFolder = srcNode?.data.filePath && srcNode.data.filePath.includes('/')
        ? srcNode.data.filePath.split('/').slice(0, -1).join('/')
        : './';
      const tgtFolder = tgtNode?.data.filePath && tgtNode.data.filePath.includes('/')
        ? tgtNode.data.filePath.split('/').slice(0, -1).join('/')
        : './';
      
      const bothMatchFolder = !selectedFolder || 
        (srcFolder.startsWith(selectedFolder) && tgtFolder.startsWith(selectedFolder));

      const baseOpacity = bothMatchFolder ? '1' : '0.1';

      return {
        ...edge,
        animated: edge.animated || (isSrcHighlighted && isTgtHighlighted),
        style: (isSrcHighlighted && isTgtHighlighted) 
          ? { stroke: '#f97316', strokeWidth: 3 }
          : { stroke: '#4b5563', strokeWidth: 1.5, opacity: baseOpacity, transition: 'opacity 0.3s ease' }
      };
    });
  }, [graphData, highlightedNodeIds, selectedFolder]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim() || !graphData) {
      setSearchResults([]);
      return;
    }
    const matches = flowNodes.filter(n => 
      n.data.label.toLowerCase().includes(val.toLowerCase())
    );
    setSearchResults(matches.slice(0, 5));
  };

  const focusOnNode = (node: any) => {
    // Navigate map window directly to coordinates
    setCenter(node.position.x + 80, node.position.y + 30, { zoom: 1.2, duration: 800 });
    setSearchQuery('');
    setSearchResults([]);
  };

  const [isTreeOpen, setIsTreeOpen] = useState(false);

  return (
    <div className="w-full h-full glass-panel rounded-xl overflow-hidden relative border border-border bg-zinc-950/40">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold tracking-wider uppercase bg-zinc-900/90 px-3.5 py-1.5 rounded-full border border-orange-500/20 backdrop-blur-md w-fit">
            🕸️ AST Dependency Map
          </h3>
          
          {/* GitHub tree toggle button */}
          {folderOptions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setIsTreeOpen(!isTreeOpen)}
                className="text-xs bg-zinc-900 border border-border hover:border-accent hover:text-accent rounded-full px-3 py-1.5 focus:outline-none text-zinc-300 font-bold cursor-pointer transition flex items-center gap-1.5"
              >
                📂 {selectedFolder ? `📁 ${selectedFolder}` : 'All Folders'}
              </button>
              
              {/* GitHub File Explorer Tree View Dropdown */}
              {isTreeOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-zinc-900/95 border border-border rounded-lg shadow-2xl z-50 p-3 max-h-72 overflow-y-auto custom-scrollbar backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-500 border-b border-border pb-1.5 mb-2">
                    Repository Explorer
                  </div>
                  
                  {/* Reset/All folders option */}
                  <button
                    onClick={() => {
                      setSelectedFolder('');
                      setIsTreeOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-zinc-800 flex items-center gap-1.5 transition ${!selectedFolder ? 'text-accent font-bold bg-accent/5' : 'text-zinc-400'}`}
                  >
                    <span>📂</span> root
                  </button>
                  
                  {/* Directory list tree */}
                  <div className="mt-1 space-y-1">
                    {folderOptions.map(dir => {
                      if (dir === './') return null;
                      const parts = dir.split('/');
                      const name = parts[parts.length - 1];
                      const depth = parts.length - 1; // 1-indexed depth

                      const handleFolderSelect = () => {
                        setSelectedFolder(dir);
                        setIsTreeOpen(false);
                        
                        // Find matching nodes for this directory path
                        const matches = flowNodes.filter(n => {
                          const nFolder = n.data.filePath && n.data.filePath.includes('/')
                            ? n.data.filePath.split('/').slice(0, -1).join('/')
                            : './';
                          return nFolder.startsWith(dir);
                        });

                        if (matches.length > 0) {
                          // Calculate boundaries
                          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                          matches.forEach(m => {
                            minX = Math.min(minX, m.position.x);
                            maxX = Math.max(maxX, m.position.x);
                            minY = Math.min(minY, m.position.y);
                            maxY = Math.max(maxY, m.position.y);
                          });

                          // Calculate width and height containing custom padding values
                          const bounds = {
                            x: minX,
                            y: minY,
                            width: Math.max(maxX - minX + 160, 200),
                            height: Math.max(maxY - minY + 80, 100),
                          };
                          
                          // Use a timeout to ensure state update has propagated to elements layout
                          setTimeout(() => {
                            fitBounds(bounds, { duration: 800, padding: 0.15 });
                          }, 50);
                        }
                      };

                      return (
                        <button
                          key={dir}
                          onClick={handleFolderSelect}
                          style={{ marginLeft: `${(depth - 1) * 12}px` }}
                          className={`w-fit max-w-full text-left py-1 px-2 text-xs rounded hover:bg-zinc-800/80 flex items-center gap-1.5 transition border-l-2 ${selectedFolder === dir ? 'border-accent text-accent font-semibold bg-accent/5' : 'border-zinc-800 text-zinc-400 hover:text-zinc-300'}`}
                        >
                          <span className="shrink-0 text-[11px]">📁</span>
                          <span className="truncate">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Node search control panel */}
        {flowNodes.length > 0 && (
          <div className="relative w-64 mt-1">
            <div className="flex items-center bg-zinc-900 border border-border rounded-lg px-2.5 py-1">
              <Search className="w-3.5 h-3.5 text-zinc-500 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Find node and focus..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="bg-transparent border-none focus:outline-none text-xs text-zinc-200 placeholder-zinc-500 w-full"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-border rounded-lg shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto custom-scrollbar">
                {searchResults.map(n => (
                  <button
                    key={n.id}
                    onClick={() => focusOnNode(n)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent/15 hover:text-accent border-b border-zinc-800 last:border-none flex justify-between items-center transition"
                  >
                    <span className="font-medium truncate">{n.data.label}</span>
                    <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                      {n.data.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {flowNodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
          <p>No graph nodes available.</p>
          <p className="text-xs text-slate-500">Ingest a codebase to render dependencies.</p>
        </div>
      ) : (
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          minZoom={0.1}
          maxZoom={3}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          className="bg-zinc-950/20"
        >
          <Controls showInteractive={true} className="bg-zinc-900 border-zinc-800 text-white fill-white" />
          <MiniMap 
            nodeColor={(node: any) => {
              if (node.data.type === 'class') return '#f97316';
              if (node.data.type === 'function' || node.data.type === 'method') return '#e4e4e7';
              return '#52525b';
            }}
            maskColor="rgba(9, 9, 11, 0.7)"
            className="bg-zinc-900 border border-zinc-800 rounded-lg"
          />
          <Background color="#3f3f46" gap={16} />
        </ReactFlow>
      )}
    </div>
  );
}

export default function Visualizer(props: VisualizerProps) {
  return (
    <ReactFlowProvider>
      <VisualizerContent {...props} />
    </ReactFlowProvider>
  );
}
