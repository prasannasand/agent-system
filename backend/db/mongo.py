"""
MongoDB connection — single shared client for the whole app.
"""

import os
from pymongo import MongoClient, DESCENDING
from pymongo.collection import Collection

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB", "agentdb")

_client = MongoClient(MONGO_URI)
_db = _client[DB_NAME]

runs_collection: Collection = _db["runs"]

# Indexes (idempotent — safe to call multiple times)
runs_collection.create_index("run_id", unique=True)
runs_collection.create_index([("created_at", DESCENDING)])
runs_collection.create_index("status")
