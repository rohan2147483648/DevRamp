export interface NodeData {
  label: string;
  type: string;
  filePath: string;
  startLine: number;
  docstring: string;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    type: string;
    data: NodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    animated?: boolean;
    style?: any;
  }>;
}

export interface Citation {
  id: string;
  name: string;
  file_path: string;
  type: string;
  score: number;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
}

export interface OnboardingDoc {
  title: string;
  architecture: string;
  modules: Array<{
    name: string;
    type: string;
    file: string;
    docstring: string;
  }>;
  setup: string;
}

export async function ingestCodebase(path: string): Promise<any> {
  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function getGraph(): Promise<GraphData> {
  const res = await fetch('/api/graph');
  return res.json();
}

export async function queryCodebase(query: string): Promise<QueryResponse> {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

export async function getOnboardingDocs(): Promise<OnboardingDoc> {
  const res = await fetch('/api/docs');
  return res.json();
}
