import os

# Root directory of the backend application
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

# Storage configuration
DATA_DIR = os.path.join(BACKEND_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "codemind.db")
VECTOR_INDEX_PATH = os.path.join(DATA_DIR, "vector_index.json")

# Model configuration
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

# Server configuration
HOST = "0.0.0.0"
PORT = 8000
ALLOW_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
