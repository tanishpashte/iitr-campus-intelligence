import os
import json
import re
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

if __name__ == "__main__":
    mcp.run()
