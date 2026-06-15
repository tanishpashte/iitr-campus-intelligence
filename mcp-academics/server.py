import json
import os
import sys
from typing import List, Optional
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from mcp.server.fastmcp import FastMCP

# Instantiate the FastMCP server layer
mcp = FastMCP("IITR Academics Server")

# Helper to load academic calendar data
def load_calendar_data() -> dict:
    file_path = os.path.join(os.path.dirname(__file__), "data", "academic-calendar.json")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

# Helper to load timetable data
def load_timetable_data() -> dict:
    file_path = os.path.join(os.path.dirname(__file__), "data", "semester-timetable.json")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

# Helper to chunk calendar data for semantic search
def load_and_chunk_calendar() -> list:
    """Reads the academic calendar and returns structured text chunks with metadata for semantic indexing."""
    try:
        data = load_calendar_data()
    except Exception as e:
        print(f"Error loading calendar for chunking: {e}", file=sys.stderr)
        return []
        
    chunks = []
    
    # 1. Chronological Schedule
    for event in data.get("chronological_schedule", []):
        details = event.get("details", "")
        days = event.get("days", [])
        days_str = f" on {', '.join(days)}" if days else ""
        
        if "start_date" in event and "end_date" in event:
            start = event["start_date"]
            end = event["end_date"]
            if start == end:
                date_str = f"Date: {start}{days_str}"
            else:
                date_str = f"Dates: {start} to {end}{days_str}"
        elif "date_slots" in event:
            slots = [f"{slot['start']} to {slot['end']}" for slot in event["date_slots"]]
            date_str = f"Dates: {', '.join(slots)}{days_str}"
        elif "tentative_dates" in event:
            date_str = f"Dates: {', '.join(event['tentative_dates'])}{days_str} (Tentative)"
        else:
            date_str = "Date not specified"
            
        text = f"Event: {details}. {date_str}."
        chunks.append({
            "type": "event",
            "text": text,
            "metadata": event
        })
        
    # 2. Official Holidays
    for holiday in data.get("official_holidays", []):
        name = holiday.get("name", "")
        date = holiday.get("date", "")
        day = holiday.get("day", "")
        note = holiday.get("note", "")
        note_str = f" ({note})" if note else ""
        text = f"Holiday: {name}{note_str}. Date: {date} ({day})."
        chunks.append({
            "type": "holiday",
            "text": text,
            "metadata": holiday
        })
        
    # 3. Rescheduling
    for res in data.get("time_table_rescheduling", []):
        res_date = res.get("rescheduled_date", "")
        day = res.get("day_of_week", "")
        follows = res.get("follows_timetable_of", "")
        text = f"Rescheduled Day: Date {res_date} ({day}) follows the timetable of {follows}."
        chunks.append({
            "type": "rescheduling",
            "text": text,
            "metadata": res
        })
        
    # 4. Compensatory classes
    for comp in data.get("compensatory_classes_ug1_only", []):
        comp_date = comp.get("date", "")
        day = comp.get("day_of_week", "")
        follows = comp.get("follows_timetable_of", "")
        text = f"Compensatory Class (UG I only): Date {comp_date} ({day}) follows the timetable of {follows}."
        chunks.append({
            "type": "compensatory",
            "text": text,
            "metadata": comp
        })
        
    return chunks

# Initialize SentenceTransformer and FAISS index
print("Initializing sentence-transformers model...", file=sys.stderr)
model = SentenceTransformer("all-MiniLM-L6-v2")

print("Loading and chunking academic calendar data...", file=sys.stderr)
calendar_chunks = load_and_chunk_calendar()

if calendar_chunks:
    print(f"Embedding {len(calendar_chunks)} calendar chunks...", file=sys.stderr)
    corpus_embeddings = model.encode([c["text"] for c in calendar_chunks], convert_to_numpy=True)
    dimension = corpus_embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)
    faiss.normalize_L2(corpus_embeddings)
    index.add(corpus_embeddings)
    print("FAISS index built successfully.", file=sys.stderr)
else:
    print("No calendar chunks found. FAISS index not created.", file=sys.stderr)
    index = None

# Helper to parse date/day inputs
def parse_date_input(date_input: str) -> tuple[Optional[datetime.date], Optional[str], Optional[str]]:
    import datetime
    clean_input = date_input.strip().lower()
    
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for w in weekdays:
        if clean_input == w or clean_input == f"this {w}" or clean_input == f"next {w}":
            return None, w.capitalize(), None
            
    if clean_input == "today":
        return datetime.date.today(), None, None
    elif clean_input == "tomorrow":
        return datetime.date.today() + datetime.timedelta(days=1), None, None
        
    try:
        parsed = datetime.datetime.strptime(date_input.strip(), "%Y-%m-%d").date()
        return parsed, None, None
    except ValueError:
        return None, None, "Invalid date format. Use YYYY-MM-DD, a weekday (e.g. 'Friday'), 'today', or 'tomorrow'."

@mcp.tool()
def get_academic_calendar(semester: Optional[str] = "autumn_2026") -> List[str]:
    """
    Get key institutional milestone dates for a given semester from the IITR academic calendar.
    
    Args:
        semester (str, optional): The semester to look up, e.g. "autumn_2026" or "spring_2026". Defaults to "autumn_2026".
    
    Returns:
        List[str]: A formatted list of milestone dates, deadlines, and holidays.
    """
    try:
        data = load_calendar_data()
    except FileNotFoundError:
        return ["Error: Academic calendar data file not found."]
    except json.JSONDecodeError:
        return ["Error: Academic calendar data is not valid JSON."]

    formatted_milestones = []
    
    # Add calendar header info
    calendar_title = data.get("calendar_title", "IITR Academic Calendar")
    scope = data.get("scope", "")
    formatted_milestones.append(f"=== {calendar_title} ({scope}) ===")
    
    # Format chronological schedule
    formatted_milestones.append("\n--- Chronological Schedule ---")
    for event in data.get("chronological_schedule", []):
        details = event.get("details", "")
        days = event.get("days", [])
        days_str = f" ({', '.join(days)})" if days else ""
        
        if "start_date" in event and "end_date" in event:
            start = event["start_date"]
            end = event["end_date"]
            if start == end:
                formatted_milestones.append(f"{start}{days_str}: {details}")
            else:
                formatted_milestones.append(f"{start} to {end}{days_str}: {details}")
        elif "date_slots" in event:
            slots = [f"{slot['start']} to {slot['end']}" for slot in event["date_slots"]]
            formatted_milestones.append(f"{', '.join(slots)}{days_str}: {details}")
        elif "tentative_dates" in event:
            dates = event["tentative_dates"]
            formatted_milestones.append(f"{', '.join(dates)}{days_str} (Tentative): {details}")
        else:
            formatted_milestones.append(f"Date details not specified{days_str}: {details}")
            
    # Format time table rescheduling
    rescheduling = data.get("time_table_rescheduling", [])
    if rescheduling:
        formatted_milestones.append("\n--- Time Table Rescheduling ---")
        for res in rescheduling:
            formatted_milestones.append(
                f"{res.get('rescheduled_date')} ({res.get('day_of_week')}): "
                f"Follows timetable of {res.get('follows_timetable_of')}"
            )
            
    # Format compensatory classes (UG 1 only)
    comp_classes = data.get("compensatory_classes_ug1_only", [])
    if comp_classes:
        formatted_milestones.append("\n--- Compensatory Classes (UG 1st Year Only) ---")
        for comp in comp_classes:
            formatted_milestones.append(
                f"{comp.get('date')} ({comp.get('day_of_week')}): "
                f"Follows timetable of {comp.get('follows_timetable_of')}"
            )

    # Format official holidays
    formatted_milestones.append("\n--- Official Holidays ---")
    for holiday in data.get("official_holidays", []):
        name = holiday.get("name", "")
        date = holiday.get("date", "")
        day = holiday.get("day", "")
        note = holiday.get("note", "")
        note_str = f" ({note})" if note else ""
        formatted_milestones.append(f"{date} ({day}): {name}{note_str}")
        
    return formatted_milestones


@mcp.tool()
def get_daily_schedule(date: str = "today") -> List[str]:
    """
    Get the student's daily schedule (classes, reschedulings, and holidays) for a specific date or weekday.
    
    Args:
        date (str): The date/weekday to check. Can be 'today', 'tomorrow', a date in 'YYYY-MM-DD' format, 
                    or a weekday name (e.g. 'Monday', 'Friday'). Defaults to 'today'.
                    
    Returns:
        List[str]: Formatted daily schedule.
    """
    parsed_date, weekday, error_msg = parse_date_input(date)
    if error_msg:
        return [error_msg]
        
    try:
        calendar = load_calendar_data()
        timetable = load_timetable_data()
    except FileNotFoundError as e:
        return [f"Error: Required data file not found: {e.filename}"]
    except json.JSONDecodeError as e:
        return [f"Error: JSON parsing failed: {e.msg}"]
        
    schedule_info = []
    
    # Case 1: Specific Date was provided (today, tomorrow, or YYYY-MM-DD)
    if parsed_date is not None:
        date_str = parsed_date.strftime("%Y-%m-%d")
        day_of_week = parsed_date.strftime("%A")
        schedule_info.append(f"Schedule for {date_str} ({day_of_week}):")
        
        # 1. Check if it is a holiday
        holidays = calendar.get("official_holidays", [])
        is_holiday = False
        for h in holidays:
            if h.get("date") == date_str:
                note = h.get("note")
                note_str = f" ({note})" if note else ""
                schedule_info.append(f"🎉 HOLIDAY: {h.get('name')}{note_str}")
                is_holiday = True
                break
        
        if is_holiday:
            schedule_info.append("No classes scheduled due to institute holiday.")
            return schedule_info
            
        # 2. Check for rescheduling
        rescheduled_day = None
        for res in calendar.get("time_table_rescheduling", []):
            if res.get("rescheduled_date") == date_str:
                rescheduled_day = res.get("follows_timetable_of")
                schedule_info.append(f"⚠️ RESCHEDULED: Today follows the timetable of {rescheduled_day}.")
                break
                
        # 3. Check for compensatory classes
        if not rescheduled_day:
            for comp in calendar.get("compensatory_classes_ug1_only", []):
                if comp.get("date") == date_str:
                    rescheduled_day = comp.get("follows_timetable_of")
                    schedule_info.append(f"📝 COMPENSATORY CLASS (UG I only): Today follows the timetable of {rescheduled_day}.")
                    break
                    
        target_day = rescheduled_day if rescheduled_day else day_of_week
        
    else:
        # Case 2: Just a day of the week was provided
        target_day = weekday
        schedule_info.append(f"Standard Schedule for {target_day} (Note: Date-specific holidays/reschedulings are not applied):")
        
    # Look up the timetable for the target day
    weekly_schedule = timetable.get("weekly_schedule", {})
    classes = weekly_schedule.get(target_day, [])
    
    if not classes:
        schedule_info.append("No classes scheduled for this day.")
        return schedule_info
        
    # Format and list classes
    courses_info = timetable.get("courses_info", {})
    schedule_info.append(f"--- Classes ({len(classes)}) ---")
    for cls in classes:
        code = cls.get("course_code", "")
        c_info = courses_info.get(code, {})
        c_name = c_info.get("course_name", "Unknown Course")
        
        time = cls.get("time", "")
        ctype = cls.get("type", "")
        room = cls.get("room_no", "")
        prof = cls.get("professor", "")
        batch = cls.get("batch", "")
        
        schedule_info.append(f"⏰ {time} | {code} ({c_name}) | {ctype} | Room: {room} | Prof: {prof} (Batch: {batch})")
        
    return schedule_info


@mcp.tool()
def search_calendar(query: str, top_k: int = 5) -> List[str]:
    """
    Search the academic calendar for matching milestones, deadlines, or holidays using semantic search.
    
    Args:
        query (str): The search query or keyword (e.g. 'exams', 'registration deadline', 'diwali').
        top_k (int, optional): The number of top results to return. Defaults to 5.
        
    Returns:
        List[str]: Most relevant matching events from the academic calendar.
    """
    if not index or not calendar_chunks:
        return ["Error: Semantic search index is not initialized."]
        
    try:
        # Encode and normalize query
        query_vector = model.encode([query], convert_to_numpy=True)
        faiss.normalize_L2(query_vector)
        
        # Search index
        distances, indices = index.search(query_vector, top_k)
        
        results = [f"Semantic search results for '{query}':"]
        found_matches = False
        
        for score, idx in zip(distances[0], indices[0]):
            if idx == -1:
                continue
            chunk = calendar_chunks[idx]
            match_text = chunk["text"]
            results.append(f"🎯 [Score: {score:.3f}] {match_text}")
            found_matches = True
            
        if not found_matches:
            return [f"No calendar entries found matching '{query}'."]
            
        return results
    except Exception as e:
        return [f"Error performing semantic search: {str(e)}"]

@mcp.tool()
def get_timetable_by_day(day: str) -> str:
    """
    Get the complete timetable array block matching a weekday name.
    
    Args:
        day (str): The day of the week to get timetable for (e.g. 'Monday', 'Friday').
    """
    try:
        timetable = load_timetable_data()
        return json.dumps(timetable.get("weekly_schedule", {}).get(day.capitalize(), []))
    except Exception as e:
        print(f"Error loading timetable: {e}", file=sys.stderr)
        return "[]"

@mcp.tool()
def get_calendar_events_by_date(date_str: str) -> dict:
    """
    Get any matching events, reschedulings, or holidays for a target date from the academic calendar.
    
    Args:
        date_str (str): The date to check in YYYY-MM-DD format.
    """
    try:
        calendar = load_calendar_data()
    except Exception as e:
        print(f"Error loading calendar: {e}", file=sys.stderr)
        return {
            "chronological_schedule": [],
            "time_table_rescheduling": [],
            "official_holidays": []
        }
    
    matching_events = []
    # Check chronological_schedule
    for event in calendar.get("chronological_schedule", []):
        # check start_date/end_date
        if "start_date" in event and "end_date" in event:
            if event["start_date"] <= date_str <= event["end_date"]:
                matching_events.append(event)
        elif "date_slots" in event:
            for slot in event["date_slots"]:
                if slot.get("start") <= date_str <= slot.get("end"):
                    matching_events.append(event)
                    break
        elif "tentative_dates" in event:
            if date_str in event["tentative_dates"]:
                matching_events.append(event)
                
    matching_rescheduling = []
    for res in calendar.get("time_table_rescheduling", []):
        if res.get("rescheduled_date") == date_str:
            matching_rescheduling.append(res)
            
    matching_holidays = []
    for h in calendar.get("official_holidays", []):
        if h.get("date") == date_str:
            matching_holidays.append(h)
            
    return {
        "chronological_schedule": matching_events,
        "time_table_rescheduling": matching_rescheduling,
        "official_holidays": matching_holidays
    }

if __name__ == "__main__":
    mcp.run()
