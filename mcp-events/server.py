import json
import os
import sys
from typing import List, Optional
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from mcp.server.fastmcp import FastMCP

# Instantiate the FastMCP server layer
mcp = FastMCP("IITR Events Server")

# Helper to classify categories
def get_category(event_name: str) -> str:
    name_lower = event_name.lower()
    if "workshop" in name_lower or "talk" in name_lower:
        return "Workshop"
    elif any(kw in name_lower for kw in ["dj", "performance", "performance", "karaoke", "fanconnect", "band"]):
        return "Pronite"
    elif any(kw in name_lower for kw in ["prelims", "finals", "final", "quiz", "mun", "apocalypse", "tournament", "showdown", "battle", "elite", "diva", "coscon"]):
        return "Competition"
    elif any(kw in name_lower for kw in ["food", "booth", "carnival", "stalls", "stall"]):
        return "Informal"
    else:
        return "Competition"

# Helper to load and chunk events
def load_and_chunk_events() -> list:
    """Reads all Thomso day itinerary JSON files and returns structured text chunks with metadata."""
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    day_files = [
        ("Day 1", "thomso-day1.json"),
        ("Day 2", "thomso-day2.json"),
        ("Day 3", "thomso-day3.json")
    ]
    
    chunks = []
    
    for day_label, filename in day_files:
        filepath = os.path.join(data_dir, filename)
        if not os.path.exists(filepath):
            continue
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            events = data.get("events", [])
            for event in events:
                event_name = event.get("event_name", "")
                time = event.get("time", "")
                venue = event.get("venue", "")
                
                # Classify category
                category = get_category(event_name)
                
                # Create structured search text
                text = f"Event: {event_name}. Venue: {venue}. Time: {time}. Day: {day_label}. Category: {category}."
                
                chunks.append({
                    "text": text,
                    "event_name": event_name,
                    "venue": venue,
                    "time": time,
                    "day": day_label,
                    "category": category
                })
        except Exception as e:
            print(f"Error loading {filename}: {e}", file=sys.stderr)
            
    return chunks

# Initialize SentenceTransformer and FAISS index
print("Initializing sentence-transformers model...", file=sys.stderr)
model = SentenceTransformer("all-MiniLM-L6-v2")

print("Loading and chunking Thomso events...", file=sys.stderr)
events_chunks = load_and_chunk_events()

if events_chunks:
    print(f"Embedding {len(events_chunks)} events...", file=sys.stderr)
    corpus_embeddings = model.encode([c["text"] for c in events_chunks], convert_to_numpy=True)
    dimension = corpus_embeddings.shape[1]
    
    # Initialize FAISS index
    index = faiss.IndexFlatIP(dimension)
    faiss.normalize_L2(corpus_embeddings)
    index.add(corpus_embeddings)
    print("FAISS index built successfully.", file=sys.stderr)
else:
    print("No events found. FAISS index not created.", file=sys.stderr)
    index = None
    corpus_embeddings = None

@mcp.tool()
def search_thomso_events(
    user_query: str,
    day: Optional[str] = None,
    venue: Optional[str] = None,
    category: Optional[str] = None,
    top_k: int = 5
) -> List[str]:
    """
    Search Thomso events using semantic vector search with optional metadata filtering.
    
    Args:
        user_query (str): The search query (e.g., 'singing competition', 'dance', 'dj night').
        day (str, optional): Filter by day. Can be '1', '2', '3' or 'Day 1', 'Day 2', 'Day 3'.
        venue (str, optional): Filter by venue (e.g. 'MAC', 'Convocation Hall'). Case-insensitive substring matching.
        category (str, optional): Filter by event category (e.g. 'Competition', 'Pronite', 'Workshop', 'Informal').
        top_k (int, optional): Number of matching results to return. Defaults to 5.
        
    Returns:
        List[str]: A list of matching events sorted by relevance.
    """
    if not events_chunks or corpus_embeddings is None:
        return ["Error: Events search index is not initialized."]
        
    try:
        # 1. Filter chunks based on metadata
        matching_indices = []
        for idx, chunk in enumerate(events_chunks):
            # Check day filter
            if day:
                day_clean = str(day).strip().lower().replace("day", "").replace(" ", "")
                chunk_day_clean = chunk["day"].lower().replace("day", "").replace(" ", "")
                if day_clean != chunk_day_clean:
                    continue
            
            # Check venue filter
            if venue:
                if venue.strip().lower() not in chunk["venue"].lower():
                    continue
                    
            # Check category filter
            if category:
                if category.strip().lower() != chunk["category"].lower():
                    continue
                    
            matching_indices.append(idx)
            
        if not matching_indices:
            return ["No Thomso events found matching the specified filters."]
            
        # 2. Extract query embedding and normalize
        query_vector = model.encode([user_query], convert_to_numpy=True)
        faiss.normalize_L2(query_vector)
        
        # 3. Calculate similarities on matching subset
        sub_embeddings = corpus_embeddings[matching_indices]
        similarities = np.dot(sub_embeddings, query_vector[0])
        
        # 4. Sort and get top_k
        sorted_sub_indices = np.argsort(similarities)[::-1]
        top_sub_indices = sorted_sub_indices[:top_k]
        
        results = [f"Semantic search results for '{user_query}':"]
        for sub_idx in top_sub_indices:
            orig_idx = matching_indices[sub_idx]
            score = similarities[sub_idx]
            chunk = events_chunks[orig_idx]
            
            results.append(
                f"🎯 [Score: {score:.3f}] {chunk['day']} | {chunk['event_name']} "
                f"| Time: {chunk['time']} | Venue: {chunk['venue']} | Category: {chunk['category']}"
            )
            
        return results
        
    except Exception as e:
        return [f"Error performing search: {str(e)}"]

if __name__ == "__main__":
    mcp.run()
