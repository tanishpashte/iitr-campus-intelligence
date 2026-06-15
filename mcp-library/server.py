import os
import sys
import json
import re
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from mcp.server.fastmcp import FastMCP


# Instantiate the FastMCP server
mcp = FastMCP("IITR Library Server")

# --- Helper Functions ---

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
            import sys
            print(f"Error loading {filename}: {e}", file=sys.stderr)
    return aggregated

def load_tbls_books():
    """Reads the first-year TBLS textbooks dataset."""
    filepath = os.path.join(os.path.dirname(__file__), "data", "tbls_books.json")
    if not os.path.exists(filepath):
        return []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get("books", [])
    except Exception as e:
        import sys
        print(f"Error loading tbls_books.json: {e}", file=sys.stderr)
        return []

def load_library_team():
    """Reads the library staff directory dataset."""
    filepath = os.path.join(os.path.dirname(__file__), "data", "library_team.json")
    if not os.path.exists(filepath):
        return []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        import sys
        print(f"Error loading library_team.json: {e}", file=sys.stderr)
        return []

def get_keywords_for_course(course_code: str) -> list:
    """Maps course code prefixes to relevant keywords for textbook matching."""
    course_code = course_code.upper().strip()
    match = re.match(r'^([A-Z]+)', course_code)
    prefix = match.group(1) if match else course_code
    
    mapping = {
        "CS": ["computer", "c++", "programming"],
        "PH": ["physics", "optics", "electromagnetic", "quantum"],
        "MA": ["mathematics", "calculus", "math"],
        "CY": ["chemistry", "organic", "inorganic", "physical chemistry"],
        "EE": ["electrical", "electronic", "circuit", "technology"],
        "EC": ["electronic", "circuit", "devices"],
        "ME": ["thermodynamics", "drawing", "mechanics", "workshop", "graphics"],
        "MI": ["thermodynamics", "drawing", "mechanics", "workshop", "graphics"],
        "CE": ["environmental", "ecology", "water", "waste"],
        "MT": ["iron", "steel", "metallurg"],
        "AR": ["architecture"]
    }
    
    for key, keywords in mapping.items():
        if prefix.startswith(key):
            return keywords
            
    return [prefix.lower()]

def load_and_chunk_markdown_files():
    """Reads and chunks informational markdown files into paragraphs."""
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    filenames = [
        "faq.md",
        "services.md",
        "Terms_and_Conditions.md",
        "library_membership_notice.md",
        "tbls_book_distribution.md"
    ]
    chunks = []
    for filename in filenames:
        filepath = os.path.join(data_dir, filename)
        if not os.path.exists(filepath):
            continue
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                # Split by paragraphs
                paragraphs = content.split("\n\n")
                for p in paragraphs:
                    p_clean = p.strip()
                    if len(p_clean) > 30:  # Skip headers or very short sentences
                        chunks.append({
                            "source": filename,
                            "text": p_clean
                        })
        except Exception as e:
            import sys
            print(f"Error reading {filename}: {e}", file=sys.stderr)
    return chunks

# --- Build Semantic Search Index ---

print("Initializing sentence-transformers model...", file=sys.stderr)
model = SentenceTransformer("all-MiniLM-L6-v2")

print("Loading and chunking markdown guidelines...", file=sys.stderr)
chunks = load_and_chunk_markdown_files()

if chunks:
    print(f"Embedding {len(chunks)} text chunks...", file=sys.stderr)
    corpus_embeddings = model.encode([c["text"] for c in chunks], convert_to_numpy=True)
    
    dimension = corpus_embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)
    
    faiss.normalize_L2(corpus_embeddings)
    index.add(corpus_embeddings)
    print("FAISS index built successfully.", file=sys.stderr)
else:
    print("No chunks found. FAISS index not created.", file=sys.stderr)
    index = None


# --- MCP Tools ---

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

@mcp.tool()
def get_tbls_textbooks(course_code: str = "", query: str = "") -> list:
    """
    Retrieve first-year Textbook Bearing Library Scheme (TBLS) textbook details.
    
    Args:
        course_code: Optional course code (e.g., "CSN-101", "PHN-101", "MAN-101") to filter by subject area.
        query: Optional general search query to filter by title or author.
    
    Returns:
        A list of textbooks matching the filters.
    """
    books = load_tbls_books()
    
    if course_code:
        keywords = get_keywords_for_course(course_code)
        filtered_books = []
        for book in books:
            title = book.get("title", "").lower()
            author = book.get("author", "").lower()
            if any(kw in title or kw in author for kw in keywords):
                filtered_books.append(book)
        books = filtered_books
        
    if query:
        query_lower = query.lower().strip()
        filtered_books = []
        for book in books:
            title = book.get("title", "").lower()
            author = book.get("author", "").lower()
            if query_lower in title or query_lower in author:
                filtered_books.append(book)
        books = filtered_books
        
    return books

# Mapping of library divisions/roles to name keywords for quick division-based search
STAFF_ROLE_MAPPINGS = {
    "procurement": ["Patra", "Sunny", "Sharma"],
    "acquisition": ["Patra", "Sunny", "Sharma"],
    "digital resources": ["Sunny", "Sharma"],
    "automation": ["Sunny", "Sharma", "Mitra"],
    "journals": ["Sudeshwar Ram", "Santosh Kumar"],
    "periodicals": ["Sudeshwar Ram", "Santosh Kumar"],
    "circulation": ["Arvind Kumar", "Sudeshwar Ram", "Fateh Singh", "Santosh Kumar"],
    "administration": ["Patra", "Sunny"]
}

@mcp.tool()
def get_library_staff(staff_role: str = None, query: str = None) -> list:
    """
    Retrieve contact info for library staff or divisions.
    
    Args:
        staff_role: Optional division or role to search for (e.g., "procurement", "digital resources", "circulation", "librarian").
        query: Optional general search query to filter by name, designation, email, or phone.
    
    Returns:
        A list of staff members matching the filters.
    """
    staff_members = load_library_team()
    
    if staff_role:
        role_lower = staff_role.lower().strip()
        matched_names = []
        
        for division, names in STAFF_ROLE_MAPPINGS.items():
            if role_lower in division or division in role_lower:
                matched_names.extend(names)
                
        filtered_staff = []
        for member in staff_members:
            name = member.get("name", "")
            designation = member.get("designation", "").lower()
            emails = [e.lower() for e in member.get("emails", [])]
            
            matches_predefined = any(last_name.lower() in name.lower() for last_name in matched_names)
            matches_details = (
                role_lower in designation or 
                any(role_lower in email for email in emails) or 
                role_lower in name.lower()
            )
            
            if matches_predefined or matches_details:
                filtered_staff.append(member)
        staff_members = filtered_staff
        
    if query:
        query_lower = query.lower().strip()
        filtered_staff = []
        for member in staff_members:
            name = member.get("name", "").lower()
            designation = member.get("designation", "").lower()
            phones = member.get("phones", [])
            emails = [e.lower() for e in member.get("emails", [])]
            
            if (
                query_lower in name or 
                query_lower in designation or 
                any(query_lower in phone for phone in phones) or 
                any(query_lower in email for email in emails)
            ):
                filtered_staff.append(member)
        staff_members = filtered_staff
        
    return staff_members

@mcp.tool()
def get_textbook_or_staff_details(course_code: str = None, staff_role: str = None, query: str = None) -> dict:
    """
    Combined query tool for retrieving first-year textbooks (by course code) OR library staff contact details (by division/role).
    
    Args:
        course_code: Optional course code to search for textbooks (e.g. "CSN-101").
        staff_role: Optional division/role to search for staff contact info (e.g. "procurement").
        query: Optional general search query to search both datasets.
        
    Returns:
        A dictionary containing "textbooks" and "staff" results.
    """
    textbooks = []
    staff = []
    
    if course_code or (query and not staff_role):
        textbooks = get_tbls_textbooks(course_code=course_code, query=query)
        
    if staff_role or (query and not course_code):
        staff = get_library_staff(staff_role=staff_role, query=query)
        
    return {
        "textbooks": textbooks,
        "staff": staff
    }

@mcp.tool()
def query_library_guidelines_and_faqs(user_prompt: str, top_k: int = 3) -> list:
    """
    Semantic search tool to query Mahatma Gandhi Central Library guidelines, policies, schedules, and FAQs.
    
    Args:
        user_prompt: The search query / prompt describing what operational rules or guidelines you want to find.
        top_k: Number of relevant results to return (default 3, max 3).
        
    Returns:
        A list of dictionaries representing the most relevant matching paragraphs, including the source file, score, and text.
    """
    if not index or not chunks:
        return []
        
    # Enforce maximum top_k of 3
    top_k = min(top_k, 3)
        
    # Encode and normalize query
    query_vector = model.encode([user_prompt], convert_to_numpy=True)
    faiss.normalize_L2(query_vector)
    
    # Search index
    distances, indices = index.search(query_vector, top_k)
    
    results = []
    for score, idx in zip(distances[0], indices[0]):
        if idx == -1:
            continue
        chunk = chunks[idx]
        # Strip out raw markdown headers (e.g. #, ##, ###) at the start of any line
        clean_text = re.sub(r'^#+\s+', '', chunk["text"], flags=re.MULTILINE).strip()
        results.append({
            "score": float(score),
            "source": chunk["source"],
            "text": clean_text
        })
        
    return results

def load_floor_plan():
    """Reads the library floor plan dataset."""
    filepath = os.path.join(os.path.dirname(__file__), "data", "floor_plan.json")
    if not os.path.exists(filepath):
        return {}
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        import sys
        print(f"Error loading floor_plan.json: {e}", file=sys.stderr)
        return {}

def locate_facility_internal(facility_name: str) -> list:
    floor_plan = load_floor_plan()
    if not floor_plan:
        return []
        
    query = facility_name.lower().strip()
    
    # Predefined synonyms/expansions for common search terms
    synonyms = {
        "bound journals": ["periodicals", "journals", "stacks", "archives"],
        "journals": ["periodicals", "stacks"],
        "study room": ["reading", "study", "carrels"],
        "reading room": ["reading", "study", "carrels"],
        "photocopy": ["photostat", "reprographic"],
        "printing": ["photostat", "reprographic"],
        "copier": ["photostat", "reprographic"],
        "thesis": ["theses", "dissertations"],
        "dissertation": ["theses", "dissertations"],
        "staff": ["office", "staff room"],
        "procurement": ["acquisition"]
    }
    
    search_terms = [query]
    for key, syn_list in synonyms.items():
        if key in query:
            search_terms.extend(syn_list)
            
    search_terms = list(dict.fromkeys(search_terms))
    
    floors = floor_plan.get("floors", {})
    results = []
    
    for term in search_terms:
        for floor_id, floor_data in floors.items():
            floor_name = floor_data.get("name", floor_id.replace("_", " ").title())
            areas = floor_data.get("areas", {})
            for zone, items in areas.items():
                for item in items:
                    if term in item.lower() or item.lower() in term:
                        results.append({
                            "facility": item,
                            "floor_name": floor_name,
                            "zone": zone.replace("_", " ").title()
                        })
                        
        location_index = floor_plan.get("location_index", {})
        for name, floors_mapped in location_index.items():
            if term in name.lower() or name.lower() in term:
                mapped_floors = floors_mapped if isinstance(floors_mapped, list) else [floors_mapped]
                for f_id in mapped_floors:
                    floor_data = floors.get(f_id, {})
                    floor_name = floor_data.get("name", f_id.replace("_", " ").title())
                    
                    zone_name = "General Area"
                    areas = floor_data.get("areas", {})
                    for zone, items in areas.items():
                        if name in items:
                            zone_name = zone.replace("_", " ").title()
                            break
                            
                    results.append({
                        "facility": name,
                        "floor_name": floor_name,
                        "zone": zone_name
                    })
                    
    seen = set()
    deduped = []
    for r in results:
        key = (r["facility"], r["floor_name"])
        if key not in seen:
            seen.add(key)
            deduped.append(r)
            
    return deduped

@mcp.tool()
def locate_library_facility(facility_name: str) -> str:
    """
    Locate a facility, section, or office inside the Mahatma Gandhi Central Library (MGCL).
    
    Args:
        facility_name: Name of the facility to locate (e.g. "reference section", "study room", "bound journals", "librarian office").
        
    Returns:
        A precise text instruction directing the student to the exact floor and zone.
    """
    results = locate_facility_internal(facility_name)
    if not results:
        return f"Could not find any library facility matching '{facility_name}' in the floor plan."
        
    instructions = [f"Here are the locations matching '{facility_name}':"]
    for r in results:
        facility = r["facility"]
        floor_name = r["floor_name"]
        zone = r["zone"]
        instructions.append(
            f"- **{facility}**: Located on the **{floor_name}** in the **{zone}** section."
        )
        
    return "\n".join(instructions)

if __name__ == "__main__":
    mcp.run()

