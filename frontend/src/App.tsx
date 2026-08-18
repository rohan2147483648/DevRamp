import React, { useState, useEffect } from 'react';
import { Network, Search, BookOpen, Settings, AlertCircle, RefreshCw } from 'lucide-react';
import Visualizer from './components/Visualizer';
import ChatInterface from './components/ChatInterface';
import DocViewer from './components/DocViewer';
import { getGraph, getOnboardingDocs, ingestCodebase, GraphData, OnboardingDoc } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<'docs' | 'visualizer'>('docs');
  const [repoPath, setRepoPath] = useState('');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [docs, setDocs] = useState<OnboardingDoc | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState('');

  const fetchProjectData = async () => {
    try {
      const graph = await getGraph();
      const onboardingDocs = await getOnboardingDocs();
      setGraphData(graph);
      setDocs(onboardingDocs);
    } catch (err) {
      console.error("Failed to load setup data:", err);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoPath.trim() || ingesting) return;
    
    setIngesting(true);
    setError('');
    try {
      const res = await ingestCodebase(repoPath.trim());
      if (res.status === 'success') {
        await fetchProjectData();
        setActiveTab('docs');
      } else {
        setError(res.detail || 'Ingestion failed.');
      }
    } catch (err: any) {
      setError('Error connecting to backend API.');
    } finally {
      setIngesting(false);
    }
  };

  // Initially load data if available
  useEffect(() => {
    fetchProjectData();
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden text-zinc-100 font-sans">
      {/* Top Navigation Header */}
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-panel/40 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-lg border border-accent/30">
            <Network className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">DevRamp</h1>
            <p className="text-[10px] text-zinc-400 font-semibold tracking-wider uppercase">AI AST-Powered Code Documentation & Onboarding</p>
          </div>
        </div>

        {/* Codebase ingestion bar */}
        <form onSubmit={handleIngest} className="flex items-center gap-2 max-w-lg w-full">
          <input
            type="text"
            placeholder="Absolute folder path to code repo..."
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            className="flex-grow bg-zinc-950/80 border border-border px-3.5 py-1.5 rounded-lg text-xs focus:outline-none focus:border-accent/50 text-zinc-200"
            disabled={ingesting}
          />
          <button
            type="submit"
            className="bg-accent hover:bg-orange-600 disabled:bg-orange-950/40 text-white rounded-lg px-4 py-1.5 text-xs font-semibold flex items-center gap-1 transition-all duration-200 hover:scale-[1.02]"
            disabled={ingesting}
          >
            {ingesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Ingest'}
          </button>
        </form>
      </header>

      {/* Main Dashboard Layout */}
      <main className="flex-grow flex p-6 gap-6 min-h-0 bg-gradient-to-br from-zinc-950 via-[#0f0f12] to-orange-950/5">
        {/* Left pane: Tab selection for documentation view vs visualizer */}
        <div className="w-[58%] flex flex-col gap-4 min-h-0">
          <div className="flex border-b border-border gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition duration-200 flex items-center gap-1.5 ${
                activeTab === 'docs'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Documentation
            </button>
            <button
              onClick={() => setActiveTab('visualizer')}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition duration-200 flex items-center gap-1.5 ${
                activeTab === 'visualizer'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Network className="w-3.5 h-3.5" /> Code Dependency Graph
            </button>
          </div>

          <div className="flex-grow min-h-0">
            {activeTab === 'docs' ? (
              <DocViewer doc={docs} />
            ) : (
              <Visualizer graphData={graphData} highlightedNodeIds={highlightedNodeIds} />
            )}
          </div>
        </div>

        {/* Right pane: Interactive Q&A chat */}
        <div className="w-[42%] flex flex-col min-h-0">
          <ChatInterface onCitationClick={(nodeIds) => {
            setHighlightedNodeIds(nodeIds);
            setActiveTab('visualizer');
          }} />
        </div>
      </main>

      {/* Error notification banner if any */}
      {error && (
        <div className="fixed bottom-4 left-4 z-50 bg-zinc-900/90 border border-red-500/50 text-red-200 px-4 py-2.5 rounded-lg shadow-xl text-xs flex items-center gap-2 backdrop-blur-md">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 hover:text-white font-bold">×</button>
        </div>
      )}
    </div>
  );
}
