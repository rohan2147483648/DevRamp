import os
from typing import Dict, Any
from backend.parsers.ast_parser import ASTParser
from backend.graph.code_graph import CodeGraph
from backend.rag.agent_engine import AgentEngine

class GithubWebhookHandler:
    def __init__(self):
        self.parser = ASTParser()
        self.graph = CodeGraph()
        self.agent = AgentEngine()

    def process_push_event(self, payload: Dict[str, Any], repo_local_path: str) -> Dict[str, Any]:
        """
        Receives GitHub webhook payload and performs incremental code ingestion for any added,
        modified, or deleted files.
        """
        commits = payload.get("commits", [])
        added_files = set()
        modified_files = set()
        removed_files = set()

        for commit in commits:
            added_files.update(commit.get("added", []))
            modified_files.update(commit.get("modified", []))
            removed_files.update(commit.get("removed", []))

        # We'll normalize file paths relative to repo_local_path
        # Remove deleted files from DB
        for file in removed_files:
            norm_file = file.replace("\\", "/")
            self.graph.remove_file_entities(norm_file)

        # Parse and update modified/added files
        updated_files = added_files.union(modified_files)
        ingested_count = 0

        for file in updated_files:
            full_path = os.path.join(repo_local_path, file)
            if os.path.exists(full_path):
                # Clean old entities first
                norm_file = file.replace("\\", "/")
                self.graph.remove_file_entities(norm_file)
                # Parse
                entities = self.parser.parse_file(full_path, repo_local_path)
                if entities:
                    self.graph.add_entities(entities)
                    ingested_count += len(entities)

        # Re-resolve edges and update vector indexes
        if updated_files or removed_files:
            self.graph.build_edges()
            self.agent.index_entities()

        return {
            "status": "success",
            "added": list(added_files),
            "modified": list(modified_files),
            "removed": list(removed_files),
            "ingested_entities": ingested_count
        }
