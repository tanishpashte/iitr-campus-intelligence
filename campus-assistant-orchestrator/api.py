import asyncio
from datetime import datetime, time
import os
import sys
import json
import contextlib
from typing import List, Dict, Any, Optional, Union
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
from mcp import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters
from dotenv import load_dotenv

# Load API keys and environment variables
load_dotenv()

# Base directory of the repository (parent of campus-assistant-orchestrator)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_python_exec(dir_name: str) -> str:
    dir_path = os.path.join(BASE_DIR, dir_name)
    # Unix-like venv
    venv_python = os.path.join(dir_path, ".venv", "bin", "python")
    if os.path.exists(venv_python):
        return venv_python
    # Windows venv
    venv_python_win = os.path.join(dir_path, ".venv", "Scripts", "python.exe")
    if os.path.exists(venv_python_win):
        return venv_python_win
    # Fallback to current environment python
    return sys.executable

# Define Server Parameters for all four microservices
library_params = StdioServerParameters(
    command=get_python_exec("mcp-library"),
    args=["server.py"],
    cwd=os.path.join(BASE_DIR, "mcp-library")
)

academics_params = StdioServerParameters(
    command=get_python_exec("mcp-academics"),
    args=["server.py"],
    cwd=os.path.join(BASE_DIR, "mcp-academics")
)

events_params = StdioServerParameters(
    command=get_python_exec("mcp-events"),
    args=["server.py"],
    cwd=os.path.join(BASE_DIR, "mcp-events")
)

mess_params = StdioServerParameters(
    command=get_python_exec("mcp-mess"),
    args=["server.py"],
    cwd=os.path.join(BASE_DIR, "mcp-mess")
)

# Mapping of MCP tools to frontend UI component identifiers
TOOL_TO_COMPONENT = {
    # Mess service tools
    "get_current_mess_meal": "mess_menu",
    "get_canteen_alternatives_by_budget": "canteen_menu",
    
    # Events service tools
    "search_thomso_events": "events_list",
    
    # Academics service tools
    "get_academic_calendar": "academic_calendar",
    "get_daily_schedule": "daily_schedule",
    "search_calendar": "calendar_search_results",
    
    # Library service tools
    "search_electronic_resources": "electronic_resources",
    "get_tbls_textbooks": "tbls_textbooks",
    "get_library_staff": "library_staff",
    "get_textbook_or_staff_details": "textbook_or_staff_details",
    "query_library_guidelines_and_faqs": "library_guidelines",
    "locate_library_facility": "library_facility",
}

# Request and Response models
class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    clear_history: bool = False

class ChatResponse(BaseModel):
    response: str
    ui_data: Optional[Dict[str, Any]] = None
    triggered_tools: List[Dict[str, Any]] = []

class DashboardInitResponse(BaseModel):
    ui_data: Optional[Dict[str, Any]] = None
    academics: Optional[Dict[str, Any]] = None

class LifespanState:
    def __init__(self):
        self.session_lib = None
        self.session_acad = None
        self.session_ev = None
        self.session_mess = None
        self.tool_map = {}
        self.function_declarations = []
        self.genai_client = None
        self.generate_config = None
        self.active_chats = {}

state = LifespanState()

def extract_tool_data(tool_result) -> Any:
    """Helper to extract and parse raw JSON/data structures from MCP tool output content blocks."""
    data_list = []
    for block in tool_result.content:
        text_val = getattr(block, "text", None)
        if text_val:
            try:
                parsed = json.loads(text_val)
                # If a single block already contains a list, return it immediately
                if isinstance(parsed, list):
                    return parsed
                # Otherwise, accumulate the parsed dict/value
                data_list.append(parsed)
            except (json.JSONDecodeError, TypeError):
                data_list.append(text_val)
        else:
            if hasattr(block, "model_dump"):
                data_list.append(block.model_dump())
            else:
                data_list.append(str(block))
                
    if len(data_list) == 1:
        return data_list[0]
    return data_list

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("Connecting to library, academics, events, and mess servers...", flush=True)
    async with contextlib.AsyncExitStack() as stack:
        # Establish STDIO connections
        read_lib, write_lib = await stack.enter_async_context(stdio_client(library_params))
        read_acad, write_acad = await stack.enter_async_context(stdio_client(academics_params))
        read_ev, write_ev = await stack.enter_async_context(stdio_client(events_params))
        read_mess, write_mess = await stack.enter_async_context(stdio_client(mess_params))
        
        # Initialize client sessions
        state.session_lib = await stack.enter_async_context(ClientSession(read_lib, write_lib))
        state.session_acad = await stack.enter_async_context(ClientSession(read_acad, write_acad))
        state.session_ev = await stack.enter_async_context(ClientSession(read_ev, write_ev))
        state.session_mess = await stack.enter_async_context(ClientSession(read_mess, write_mess))
        
        print("Initializing sessions (MCP Handshake)...", flush=True)
        async def safe_initialize(session, name):
            try:
                await asyncio.wait_for(session.initialize(), timeout=60.0)
                print(f"MCP session '{name}' initialized successfully.", flush=True)
            except Exception as e:
                print(f"WARNING: MCP session '{name}' failed to initialize: {e}. Service will be unavailable.", flush=True)

        await asyncio.gather(
            safe_initialize(state.session_lib, "library"),
            safe_initialize(state.session_acad, "academics"),
            safe_initialize(state.session_ev, "events"),
            safe_initialize(state.session_mess, "mess"),
        )
        
        print("Handshakes complete. Aggregating tools...", flush=True)
        try:
            from anyio import ClosedResourceError
        except ImportError:
            ClosedResourceError = Exception

        async def register_session_tools(session, name):
            if session is None:
                print(f"WARNING: Cannot list tools for '{name}' because session is None.", flush=True)
                return
            try:
                tools_result = await session.list_tools()
                for tool in tools_result.tools:
                    state.tool_map[tool.name] = session
                    state.function_declarations.append(
                        types.FunctionDeclaration(
                            name=tool.name,
                            description=tool.description,
                            parametersJsonSchema=tool.inputSchema
                        )
                    )
            except ClosedResourceError as e:
                print(f"WARNING: MCP session '{name}' connection closed or failed handshake. Skipping tool registration. Error: {e}", flush=True)
            except Exception as e:
                print(f"WARNING: Failed to list tools for '{name}' session: {e}", flush=True)

        await register_session_tools(state.session_lib, "library")
        await register_session_tools(state.session_acad, "academics")
        await register_session_tools(state.session_ev, "events")
        await register_session_tools(state.session_mess, "mess")
            
        print(f"Total tools discovered and registered: {len(state.function_declarations)}", flush=True)
        
        # Initialize Gemini Client
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set in environment/dotenv files.")
            
        state.genai_client = genai.Client(api_key=api_key)
        state.generate_config = types.GenerateContentConfig(
            tools=[types.Tool(functionDeclarations=state.function_declarations)],
            systemInstruction=(
                "You are the IITR Campus Assistant. You help students with information from the library, "
                "academics (schedules/calendar), events (Thomso), and the hostel mess (menus and prices). "
                "Answer questions clearly. When you need information, call the appropriate tools. "
                "CRITICAL INSTRUCTIONS: "
                "1) If a tool returns no results, do NOT retry calling the same tool multiple times. Accept the result. "
                "2) For long lists (like food items, menu alternatives, or many events), DO NOT list all items in your chat text response. "
                "Instead, just provide a short summary and tell the user to look at the UI dashboard widget. "
                "3) Do NOT call 'get_current_mess_meal' when asked for 'canteen' or 'food under X budget', use 'get_canteen_alternatives_by_budget' instead."
            )
        )
        
        yield
        # Shutdown logic is handled automatically by AsyncExitStack context exit
        print("Shutting down API server and closing microservice connections...", flush=True)

app = FastAPI(
    title="IITR Campus Intelligence Assistant API",
    description="Backend bridge wrapping the campus assistant MCP orchestrator in FastAPI.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    if not state.genai_client:
        raise HTTPException(status_code=503, detail="Gemini client is not initialized.")
        
    MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"]
    
    response = None
    triggered_tools = []
    
    try:
        for model_name in MODELS:
            try:
                # Handle chat history session matching current model
                if request.clear_history or request.session_id not in state.active_chats:
                    chat = state.genai_client.chats.create(
                        model=model_name,
                        config=state.generate_config
                    )
                    state.active_chats[request.session_id] = {
                        "chat": chat,
                        "model": model_name
                    }
                else:
                    session_info = state.active_chats[request.session_id]
                    if session_info["model"] == model_name:
                        chat = session_info["chat"]
                    else:
                        # Migrate existing history to the failover model
                        history = session_info["chat"].get_history()
                        chat = state.genai_client.chats.create(
                            model=model_name,
                            history=history,
                            config=state.generate_config
                        )
                        state.active_chats[request.session_id] = {
                            "chat": chat,
                            "model": model_name
                        }
                
                # Send initial message (run blocking SDK call in background thread)
                response = await asyncio.to_thread(chat.send_message, request.message)
                
                # Process tool execution loop
                while response.function_calls:
                    tool_responses = []
                    for call in response.function_calls:
                        name = call.name
                        args = call.args
                        print(f"⚙️ Running tool '{name}' with args: {args}...", flush=True)
                        
                        if name in state.tool_map:
                            session = state.tool_map[name]
                            try:
                                tool_result = await session.call_tool(name, args)
                                formatted_result = {
                                    "content": [block.model_dump() for block in tool_result.content]
                                }
                                
                                tool_data = extract_tool_data(tool_result)
                                triggered_tools.append({
                                    "tool_name": name,
                                    "ui_component": TOOL_TO_COMPONENT.get(name, "generic"),
                                    "data": tool_data
                                })
                                print(f"✅ Tool '{name}' returned successfully.", flush=True)
                            except Exception as e:
                                formatted_result = {"error": str(e)}
                                triggered_tools.append({
                                    "tool_name": name,
                                    "ui_component": TOOL_TO_COMPONENT.get(name, "generic"),
                                    "error": str(e),
                                    "data": None
                                })
                                print(f"❌ Tool '{name}' failed: {e}", flush=True)
                        else:
                            formatted_result = {"error": f"Tool '{name}' not found."}
                            triggered_tools.append({
                                "tool_name": name,
                                "ui_component": "generic",
                                "error": f"Tool '{name}' not found.",
                                "data": None
                            })
                            print(f"⚠️ Tool '{name}' not found.", flush=True)
                            
                        part = types.Part(
                            function_response=types.FunctionResponse(
                                name=name,
                                response=formatted_result
                            )
                        )
                        tool_responses.append(part)
                        
                    # Send tool outputs back to model (run blocking SDK call in background thread)
                    response = await asyncio.to_thread(chat.send_message, tool_responses)
                
                # If generation completes successfully, break from failover loop
                break
                
            except Exception as e:
                err_msg = str(e)
                is_quota_error = any(term in err_msg for term in ["429", "ResourceExhausted", "Quota exceeded", "RPD limit reached"])
                if is_quota_error and model_name != MODELS[-1]:
                    print(f"⚠️ WARNING: Model '{model_name}' exhausted quota/limits. Error: {err_msg}. Failing over to '{MODELS[-1]}'...", file=sys.stderr, flush=True)
                    # Clear partially accumulated tools since we are retrying fresh
                    triggered_tools = []
                    continue
                else:
                    raise e
                    
        # Compile response structure
        response_text = response.text if response.text else "[No text response returned]"
        
        ui_data = None
        if triggered_tools:
            # Pick first successful tool call metadata, or fallback to first tool call if all errored
            successful = [t for t in triggered_tools if "error" not in t]
            if successful:
                ui_data = {
                    "ui_component": successful[0]["ui_component"],
                    "type": successful[0]["ui_component"],
                    "data": successful[0]["data"]
                }
            else:
                ui_data = {
                    "ui_component": triggered_tools[0]["ui_component"],
                    "type": triggered_tools[0]["ui_component"],
                    "data": triggered_tools[0].get("data"),
                    "error": triggered_tools[0].get("error")
                }
                
        return ChatResponse(
            response=response_text,
            ui_data=ui_data,
            triggered_tools=triggered_tools
        )
        
    except Exception as e:
        print(f"Error in chat endpoint: {e}", file=sys.stderr, flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/init", response_model=DashboardInitResponse)
async def dashboard_init_endpoint():
    if not state.session_mess or not state.session_acad:
        raise HTTPException(status_code=503, detail="Mess or Academics service is not initialized.")
        
    # Determine meal type based on local time
    now = datetime.now()
    current_time = now.time()
    
    # 9:30 am
    limit_breakfast = time(9, 30)
    # 2:30 pm (14:30)
    limit_lunch = time(14, 30)
    
    if current_time <= limit_breakfast:
        meal_type = "breakfast"
    elif limit_breakfast < current_time < limit_lunch:
        meal_type = "lunch"
    else:
        meal_type = "dinner"
        
    weekday = now.strftime("%A")
    date_str = now.strftime("%Y-%m-%d")
    print(f"⚙️ Running direct bypass dashboard init logic. Current time: {current_time}. Fetching: '{meal_type}' meal and Academics data for {weekday} ({date_str})...", flush=True)
    
    try:
        # Call the mess server for all 3 meals
        b_res = await state.session_mess.call_tool("get_current_mess_meal", {"meal_type": "breakfast"})
        l_res = await state.session_mess.call_tool("get_current_mess_meal", {"meal_type": "lunch"})
        d_res = await state.session_mess.call_tool("get_current_mess_meal", {"meal_type": "dinner"})
        
        # Structure the data matching the frontend's mess_menu component contract
        ui_data = {
            "type": "mess_menu",
            "data": {
                "breakfast": extract_tool_data(b_res),
                "lunch": extract_tool_data(l_res),
                "dinner": extract_tool_data(d_res),
                "active_meal": meal_type
            }
        }

        # Call the Academics Server tools directly
        timetable_result = await state.session_acad.call_tool("get_timetable_by_day", {"day": weekday})
        timetable_data = extract_tool_data(timetable_result)

        calendar_result = await state.session_acad.call_tool("get_calendar_events_by_date", {"date_str": date_str})
        calendar_data = extract_tool_data(calendar_result)

        academics_dict = {
            "timetable": timetable_data,
            "calendar": calendar_data
        }
        
        print(f"✅ Dashboard init successfully fetched all meals and Academics data.", flush=True)
        return DashboardInitResponse(ui_data=ui_data, academics=academics_dict)
    except Exception as e:
        print(f"❌ Error in direct bypass dashboard init: {e}", file=sys.stderr, flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_endpoint():
    # Return health status indicating if connections are alive
    mcp_status = {
        "library": state.session_lib is not None,
        "academics": state.session_acad is not None,
        "events": state.session_ev is not None,
        "mess": state.session_mess is not None
    }
    return {
        "status": "healthy" if all(mcp_status.values()) else "degraded",
        "mcp_services": mcp_status
    }
