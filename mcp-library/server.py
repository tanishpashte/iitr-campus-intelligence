import os
import json
from mcp.server.fastmcp import FastMCP

# Instantiate the FastMCP server
mcp = FastMCP("IITR Library Server")

def load_electronic_resources():
    """Reads and aggregates structured JSON files from the data directory."""
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    files = [
        "ebooks.json",
        "edatabases.json",
        "ejournals.json",
        "enewspaper.json",
        "estandards.json",
        "ethesis.json"
    ]
    aggregated = {}
    for filename in files:
        filepath = os.path.join(data_dir, filename)
        if not os.path.exists(filepath):
            continue
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                category = data.get("category")
                resources = data.get("resources", [])
                if category:
                    aggregated[category] = resources
        except Exception as e:
            # Print to stderr for server logging
            import sys
            print(f"Error loading {filename}: {e}", file=sys.stderr)
    return aggregated

@mcp.tool()
def search_electronic_resources(resource_type: str, query: str) -> list:
    """
    Search electronic resources at IITR (e-books, e-journals, e-databases, etc.).
    
    Args:
        resource_type: The category of resource to search. Must match or be close to one of:
                       - "e-Books"
                       - "e-Databases"
                       - "e-Journals"
                       - "e-Newspaper/ e-Magazines"
                       - "estandards"
                       - "ethesis"
        query: Query string to filter names (titles) or subscription links (URLs). Case-insensitive.
    
    Returns:
        A list of matching resource dictionaries containing title and url.
    """
    aggregated = load_electronic_resources()
    categories = list(aggregated.keys())
    
    # Normalize resource_type for flexible matching
    norm_input = resource_type.lower().strip().replace(" ", "").replace("-", "").replace("/", "")
    matching_category = None
    for cat in categories:
        norm_cat = cat.lower().replace(" ", "").replace("-", "").replace("/", "")
        if norm_input == norm_cat or norm_input in norm_cat or norm_cat in norm_input:
            matching_category = cat
            break
            
    if not matching_category:
        raise ValueError(
            f"Resource type '{resource_type}' not found. "
            f"Available categories: {', '.join(categories)}"
        )
        
    resources = aggregated[matching_category]
    query_lower = query.lower().strip()
    
    results = []
    for res in resources:
        title = res.get("title", "")
        url = res.get("url", "")
        if query_lower in title.lower() or query_lower in url.lower():
            results.append(res)
            
    return results

if __name__ == "__main__":
    mcp.run()
