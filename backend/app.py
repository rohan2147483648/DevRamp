import os
import sqlite3
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from backend.config import ALLOW_CORS_ORIGINS
from backend.parsers.ast_parser import ASTParser
from backend.graph.code_graph import CodeGraph
from backend.rag.agent_engine import AgentEngine
from backend.webhooks.github_handler import GithubWebhookHandler

app = FastAPI(title="DevRamp API Backend", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global instances
parser = ASTParser()
graph = CodeGraph()
agent_engine = AgentEngine()
webhook_handler = GithubWebhookHandler()

# Keep track of active workspace paths ingested
active_workspaces = {}

class IngestRequest(BaseModel):
    path: str

class QueryRequest(BaseModel):
    query: str

def run_ingestion(repo_path: str):
    """
    Scans repo_path for python, JS, and TS files, parses them, constructs the graph
    and updates the vector store embeddings.
    """
    if not os.path.exists(repo_path):
        return
    
    # 1. Clear database entities
    graph.clear_graph()
    
    # 2. Walk workspace folder
    all_entities = []
    for root, _, files in os.walk(repo_path):
        # Exclude node_modules, .git, venv
        if any(part in root for part in ["node_modules", ".git", "venv", "__pycache__", "dist", "build"]):
            continue
        for file in files:
            full_path = os.path.join(root, file)
            entities = parser.parse_file(full_path, repo_path)
            if entities:
                all_entities.extend(entities)

    # 3. Store entities in DB
    if all_entities:
        graph.add_entities(all_entities)
        
    # 4. Resolve linkages (calls, imports)
    graph.build_edges()
    
    # 5. Build vector index
    agent_engine.index_entities()
    
    active_workspaces["current"] = repo_path

@app.post("/api/ingest")
def ingest_codebase(req: IngestRequest, background_tasks: BackgroundTasks):
    normalized_path = os.path.abspath(req.path)
    if not os.path.exists(normalized_path):
        raise HTTPException(status_code=404, detail="Provided directory path does not exist")
    
    # Run synchronously or in background. For quick interactive feel, we run synchronously
    # unless it's very large. Let's run synchronously to ensure data is populated immediately
    run_ingestion(normalized_path)
    return {
        "status": "success",
        "message": f"Successfully ingested codebase from {normalized_path}"
    }

@app.get("/api/graph")
def get_graph():
    data = graph.get_visualization_data()
    return data

@app.post("/api/query")
def query_codebase(req: QueryRequest):
    try:
        response = agent_engine.query(req.query)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/docs")
def get_onboarding_docs():
    """
    Generates structured onboarding documents inferred from project configuration and database context.
    """
    # Attempt to find project files in the current active ingested codebase
    repo_path = active_workspaces.get("current", "")
    if not repo_path:
        return {
            "title": "Project Onboarding Guide",
            "architecture": "No codebase has been ingested yet. Please trigger an ingest first.",
            "modules": [],
            "setup": "Ingest a project to view configuration details."
        }

    # Extract details
    setup_info = "No build setup file (package.json / requirements.txt) detected."
    for file in ["package.json", "requirements.txt", "setup.py", "pyproject.toml"]:
        test_path = os.path.join(repo_path, file)
        if os.path.exists(test_path):
            with open(test_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                setup_info = f"Found `{file}` configuration file:\n\n```\n{content[:800]}\n```"
                break

    # Read top functions/classes from DB
    conn = sqlite3.connect(graph.db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name, type, file_path, docstring FROM entities WHERE type IN ('class', 'function') LIMIT 10")
    entities = cursor.fetchall()
    conn.close()

    modules_summary = []
    for ent in entities:
        modules_summary.append({
            "name": ent[0],
            "type": ent[1],
            "file": ent[2],
            "docstring": ent[3] or "No documentation provided."
        })

    # Basic architecture summary
    architecture = f"The codebase located at `{repo_path}` contains {len(modules_summary)} major classes or functions. Key entrypoints are mapped in the graph visualizer. Relational dependencies flow from module imports down to specific method calls."

    return {
        "title": f"Onboarding Guide - {os.path.basename(repo_path)}",
        "architecture": architecture,
        "modules": modules_summary,
        "setup": setup_info
    }

@app.post("/api/webhook/github")
async def github_webhook(request: Request):
    """
    Receives push hooks from GitHub. Resolves repo_local_path to current active workspace.
    """
    payload = await request.json()
    repo_path = active_workspaces.get("current")
    if not repo_path:
        return {"status": "skipped", "reason": "No active ingested workspace path"}

    result = webhook_handler.process_push_event(payload, repo_path)
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
