import os
import json
import sqlite3
import numpy as np
from typing import List, Dict, Any, Tuple
from sentence_transformers import SentenceTransformer
from backend.config import DB_PATH, VECTOR_INDEX_PATH

class AgentEngine:
    def __init__(self):
        self.db_path = DB_PATH
        self.vector_index_path = VECTOR_INDEX_PATH
        # Use a small local transformer model to avoid external API calls
        self.embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        self.index_data = {}
        self.load_vector_index()

    def load_vector_index(self):
        if os.path.exists(self.vector_index_path):
            try:
                with open(self.vector_index_path, "r", encoding="utf-8") as f:
                    self.index_data = json.load(f)
            except Exception as e:
                print(f"Error loading vector index: {e}")
                self.index_data = {}
        else:
            self.index_data = {}

    def save_vector_index(self):
        try:
            with open(self.vector_index_path, "w", encoding="utf-8") as f:
                json.dump(self.index_data, f, indent=2)
        except Exception as e:
            print(f"Error saving vector index: {e}")

    def index_entities(self):
        """
        Embeds the code/docstrings of all database entities and saves them to vector_index.json.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT id, type, name, full_name, file_path, docstring, code FROM entities")
        rows = cursor.fetchall()
        conn.close()

        if not rows:
            return

        texts_to_embed = []
        entity_ids = []
        metadata_list = []

        for r in rows:
            ent_id, ent_type, name, full_name, file_path, docstring, code = r
            # Format text representation for embedding (embedding type + code summary/body)
            summary = f"Entity Type: {ent_type}\nName: {full_name}\nFile: {file_path}\nDescription: {docstring}\nCode:\n{code}"
            texts_to_embed.append(summary)
            entity_ids.append(ent_id)
            metadata_list.append({
                "id": ent_id,
                "type": ent_type,
                "name": name,
                "full_name": full_name,
                "file_path": file_path,
                "docstring": docstring,
                "code": code
            })

        # Calculate embeddings
        embeddings = self.embedding_model.encode(texts_to_embed, show_progress_bar=False)

        # Store in dict
        for ent_id, emb, meta in zip(entity_ids, embeddings, metadata_list):
            self.index_data[ent_id] = {
                "embedding": emb.tolist(),
                "metadata": meta
            }
        self.save_vector_index()

    def query(self, user_query: str, limit: int = 5) -> Dict[str, Any]:
        """
        Calculates cosine similarity between user query and all entity embeddings.
        Returns top matches and formats an answer using local heuristics (Agentic RAG context).
        """
        if not self.index_data:
            # Reindex if empty
            self.index_entities()
            if not self.index_data:
                return {
                    "answer": "The codebase has not been ingested yet. Please ingest a codebase first.",
                    "citations": []
                }

        query_vector = self.embedding_model.encode([user_query])[0]

        scores = []
        for ent_id, data in self.index_data.items():
            emb = np.array(data["embedding"])
            # Cosine similarity
            dot_val = np.dot(query_vector, emb)
            norm_q = np.linalg.norm(query_vector)
            norm_e = np.linalg.norm(emb)
            score = dot_val / (norm_q * norm_e) if norm_q > 0 and norm_e > 0 else 0.0
            scores.append((score, data["metadata"]))

        # Sort descending
        scores.sort(key=lambda x: x[0], reverse=True)
        top_matches = scores[:limit]

        # Build response answer
        citations = []
        context_blocks = []
        for score, meta in top_matches:
            citations.append({
                "id": meta["id"],
                "name": meta["name"],
                "file_path": meta["file_path"],
                "type": meta["type"],
                "score": float(score)
            })
            context_blocks.append(
                f"### {meta['type'].upper()}: {meta['full_name']} (File: {meta['file_path']})\n"
                f"```\n{meta['code']}\n```"
            )

        # Synthesize answer (Agent logic)
        answer_intro = f"Based on the codebase analysis, here are the most relevant structural elements matching '{user_query}':\n\n"
        details = ""
        for score, meta in top_matches:
            doc_str = f" - *{meta['docstring']}*" if meta['docstring'] else ""
            details += f"- **{meta['full_name']}** ({meta['type']} in `{meta['file_path']}`){doc_str}\n"

        main_citation = top_matches[0][1] if top_matches else None
        if main_citation:
            details += f"\nHere is a snippet from `{main_citation['file_path']}` for reference:\n```python\n{main_citation['code'][:400]}...\n```\n"

        answer = answer_intro + details + "\nFeel free to explore the visual code map on the left to see how these modules link together!"

        return {
            "answer": answer,
            "citations": citations
        }
