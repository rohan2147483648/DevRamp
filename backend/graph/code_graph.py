import sqlite3
import networkx as nx
import os
import json
from typing import List, Dict, Any, Tuple
from backend.config import DB_PATH

class CodeGraph:
    def __init__(self):
        self.db_path = DB_PATH
        self.init_db()

    def init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        # Entities Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS entities (
                id TEXT PRIMARY KEY,
                type TEXT,
                name TEXT,
                full_name TEXT,
                file_path TEXT,
                start_line INTEGER,
                end_line INTEGER,
                docstring TEXT,
                code TEXT,
                calls TEXT
            )
        """)
        # Edges Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS edges (
                source TEXT,
                target TEXT,
                type TEXT,
                PRIMARY KEY (source, target, type)
            )
        """)
        conn.commit()
        conn.close()

    def clear_graph(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM entities")
        cursor.execute("DELETE FROM edges")
        conn.commit()
        conn.close()

    def add_entities(self, entities: List[Dict[str, Any]]):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        for ent in entities:
            # Generate unique ID based on file_path and full_name
            entity_id = f"{ent['file_path']}::{ent['full_name']}"
            cursor.execute("""
                INSERT OR REPLACE INTO entities 
                (id, type, name, full_name, file_path, start_line, end_line, docstring, code, calls)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entity_id,
                ent["type"],
                ent["name"],
                ent["full_name"],
                ent["file_path"],
                ent["start_line"],
                ent["end_line"],
                ent["docstring"],
                ent["code"],
                json.dumps(ent.get("calls", []))
            ))
        conn.commit()
        conn.close()

    def remove_file_entities(self, file_path: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        # Find entity IDs
        cursor.execute("SELECT id FROM entities WHERE file_path = ?", (file_path,))
        ids = [r[0] for r in cursor.fetchall()]
        if ids:
            placeholders = ",".join("?" for _ in ids)
            cursor.execute(f"DELETE FROM entities WHERE file_path = ?", (file_path,))
            cursor.execute(f"DELETE FROM edges WHERE source IN ({placeholders}) OR target IN ({placeholders})", ids + ids)
        conn.commit()
        conn.close()

    def build_edges(self):
        """
        Calculates relationship edges (imports, class hierarchy, and call hierarchy)
        based on current database entities.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Read all entities
        cursor.execute("SELECT id, type, name, full_name, file_path, calls FROM entities")
        entities = []
        for r in cursor.fetchall():
            entities.append({
                "id": r[0],
                "type": r[1],
                "name": r[2],
                "full_name": r[3],
                "file_path": r[4],
                "calls": json.loads(r[5])
            })
            
        new_edges = []
        
        # Find Calls (match calls names to target full_names or names)
        # We simplify call matching: if entity A calls 'foo', we look for an entity B with name or full_name = 'foo'
        name_map = {}
        for ent in entities:
            # Map simple name to potential IDs
            if ent["name"] not in name_map:
                name_map[ent["name"]] = []
            name_map[ent["name"]].append(ent["id"])
            # Map full name to potential IDs
            if ent["full_name"] not in name_map:
                name_map[ent["full_name"]] = []
            name_map[ent["full_name"]].append(ent["id"])

        for ent in entities:
            # File dependency mapping: A file imports modules or depends on files
            if ent["type"] == "import":
                # Find if any entity lives in a file matching part of the import text
                # Simple import resolution
                import_text = ent["name"]
                for target_ent in entities:
                    if target_ent["type"] != "import":
                        # Check if class/function name matches import or file name matches import
                        clean_import = import_text.split(" ")[-1] # last part of import
                        if target_ent["name"] in clean_import or clean_import in target_ent["file_path"]:
                            new_edges.append((ent["id"], target_ent["id"], "imports"))

            # Call dependency mapping
            for call in ent["calls"]:
                # Simple name extraction (e.g. self.do_something() -> do_something)
                clean_call = call.split(".")[-1]
                if clean_call in name_map:
                    for target_id in name_map[clean_call]:
                        if target_id != ent["id"]:
                            new_edges.append((ent["id"], target_id, "calls"))

        # Save Edges
        cursor.execute("DELETE FROM edges")
        for src, tgt, edge_type in set(new_edges):
            cursor.execute("INSERT OR REPLACE INTO edges (source, target, type) VALUES (?, ?, ?)", (src, tgt, edge_type))
            
        conn.commit()
        conn.close()

    def get_networkx_graph(self) -> nx.DiGraph:
        G = nx.DiGraph()
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, type, name, file_path, start_line FROM entities")
        for r in cursor.fetchall():
            G.add_node(r[0], type=r[1], name=r[2], file_path=r[3], start_line=r[4])
            
        cursor.execute("SELECT source, target, type FROM edges")
        for r in cursor.fetchall():
            G.add_edge(r[0], r[1], type=r[2])
            
        conn.close()
        return G

    def get_visualization_data(self) -> Dict[str, Any]:
        """
        Returns JSON compatible with React Flow: nodes & edges lists.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, type, name, file_path, start_line, docstring FROM entities")
        nodes = []
        for r in cursor.fetchall():
            nodes.append({
                "id": r[0],
                "type": "codeNode", # Custom React Flow Node
                "data": {
                    "label": r[2],
                    "type": r[1],
                    "filePath": r[3],
                    "startLine": r[4],
                    "docstring": r[5]
                }
            })
            
        cursor.execute("SELECT source, target, type FROM edges")
        edges = []
        for idx, r in enumerate(cursor.fetchall()):
            edges.append({
                "id": f"e{idx}",
                "source": r[0],
                "target": r[1],
                "label": r[2],
                "animated": r[2] == "calls",
                "style": {"stroke": "#a855f7" if r[2] == "calls" else "#3b82f6"}
            })
            
        conn.close()
        return {"nodes": nodes, "edges": edges}
