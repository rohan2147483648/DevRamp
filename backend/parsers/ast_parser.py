import os
import re
from typing import List, Dict, Any, Optional

class ASTParser:
    def __init__(self):
        # Using a regex-based parser as a highly portable and fast solution on Windows with Python 3.14+
        # because the binary bindings for Tree-sitter query schemas change frequently.
        pass

    def get_language_from_ext(self, filepath: str) -> Optional[str]:
        ext = os.path.splitext(filepath)[1].lower()
        if ext == ".py":
            return "python"
        elif ext in [".js", ".jsx"]:
            return "javascript"
        elif ext in [".ts", ".tsx"]:
            return "typescript"
        return None

    def parse_file(self, filepath: str, repo_root: str) -> List[Dict[str, Any]]:
        lang_name = self.get_language_from_ext(filepath)
        if not lang_name:
            return []

        rel_path = os.path.relpath(filepath, repo_root).replace("\\", "/")

        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading file {filepath}: {e}")
            return []

        entities = []
        lines = content.splitlines()

        if lang_name == "python":
            # Parse python classes, defs, imports
            class_matches = re.finditer(r"^class\s+(\w+)(?:\(([^)]+)\))?:", content, re.MULTILINE)
            for m in class_matches:
                class_name = m.group(1)
                start_char = m.start()
                start_line = content[:start_char].count("\n") + 1
                
                # Extract code slice
                end_line = len(lines)
                entities.append({
                    "type": "class",
                    "name": class_name,
                    "full_name": class_name,
                    "file_path": rel_path,
                    "start_line": start_line,
                    "end_line": end_line,
                    "docstring": f"Python Class: {class_name}",
                    "code": m.group(0),
                    "calls": []
                })

            func_matches = re.finditer(r"^\s*def\s+(\w+)\s*\(([^)]*)\):", content, re.MULTILINE)
            for m in func_matches:
                func_name = m.group(1)
                start_char = m.start()
                start_line = content[:start_char].count("\n") + 1
                
                entities.append({
                    "type": "function",
                    "name": func_name,
                    "full_name": func_name,
                    "file_path": rel_path,
                    "start_line": start_line,
                    "end_line": start_line + 5,
                    "docstring": f"Python Function: {func_name}",
                    "code": m.group(0),
                    "calls": []
                })

            # Extract imports
            import_matches = re.finditer(r"^\s*(?:import\s+\w+|from\s+\w+\s+import\s+\w+)", content, re.MULTILINE)
            for m in import_matches:
                start_line = content[:m.start()].count("\n") + 1
                entities.append({
                    "type": "import",
                    "name": m.group(0).strip(),
                    "full_name": m.group(0).strip(),
                    "file_path": rel_path,
                    "start_line": start_line,
                    "end_line": start_line,
                    "docstring": "Import statement",
                    "code": m.group(0).strip(),
                    "calls": []
                })

        elif lang_name in ["javascript", "typescript"]:
            # Parse JS/TS classes, functions, calls, imports
            class_matches = re.finditer(r"(?:export\s+)?class\s+(\w+)", content)
            for m in class_matches:
                class_name = m.group(1)
                start_line = content[:m.start()].count("\n") + 1
                entities.append({
                    "type": "class",
                    "name": class_name,
                    "full_name": class_name,
                    "file_path": rel_path,
                    "start_line": start_line,
                    "end_line": start_line + 20,
                    "docstring": f"JavaScript Class: {class_name}",
                    "code": m.group(0),
                    "calls": []
                })

            func_matches = re.finditer(r"(?:export\s+)?(?:async\s+)?function\s+(\w+)", content)
            for m in func_matches:
                func_name = m.group(1)
                start_line = content[:m.start()].count("\n") + 1
                entities.append({
                    "type": "function",
                    "name": func_name,
                    "full_name": func_name,
                    "file_path": rel_path,
                    "start_line": start_line,
                    "end_line": start_line + 10,
                    "docstring": f"JavaScript Function: {func_name}",
                    "code": m.group(0),
                    "calls": []
                })

            # Extract imports
            import_matches = re.finditer(r"import\s+[\s\S]*?\s+from\s+['\"](.*?)['\"]", content)
            for m in import_matches:
                start_line = content[:m.start()].count("\n") + 1
                entities.append({
                    "type": "import",
                    "name": m.group(0).strip(),
                    "full_name": m.group(0).strip(),
                    "file_path": rel_path,
                    "start_line": start_line,
                    "end_line": start_line,
                    "docstring": f"JS Import from {m.group(1)}",
                    "code": m.group(0).strip(),
                    "calls": []
                })

        # For each class/function entity, extract calls *only* within its own code block
        # to ensure edge connections are precise and only created if they actually occur there.
        for ent in entities:
            if ent["type"] in ["class", "function"]:
                # Identify actual block bounds in content
                block_code = ""
                # Calculate start char
                start_lines = ent["start_line"] - 1
                try:
                    ent_lines = lines[start_lines:ent["end_line"]]
                    block_code = "\n".join(ent_lines)
                except Exception:
                    block_code = content

                # Extract calls local to this block only
                local_calls = re.findall(r"\b(\w+)\s*\(", block_code)
                ent["calls"] = [c for c in set(local_calls) if c != ent["name"]]

        return entities
