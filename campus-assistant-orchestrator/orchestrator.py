import asyncio
import os
import sys
from typing import List
from google import genai
from google.genai import types
from mcp import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters
from dotenv import load_dotenv

# Load API keys and environment variables
load_dotenv()

# Define Server Parameters for all three microservices
library_params = StdioServerParameters(
    command="/home/tanish/code/projects/iitr-campus-intelligence/mcp-library/.venv/bin/python",
    args=["server.py"],
    cwd="/home/tanish/code/projects/iitr-campus-intelligence/mcp-library"
)

academics_params = StdioServerParameters(
    command="/home/tanish/code/projects/iitr-campus-intelligence/mcp-academics/.venv/bin/python",
    args=["server.py"],
    cwd="/home/tanish/code/projects/iitr-campus-intelligence/mcp-academics"
)

events_params = StdioServerParameters(
    command="/home/tanish/code/projects/iitr-campus-intelligence/mcp-events/.venv/bin/python",
    args=["server.py"],
    cwd="/home/tanish/code/projects/iitr-campus-intelligence/mcp-events"
)

mess_params = StdioServerParameters(
    command="/home/tanish/code/projects/iitr-campus-intelligence/mcp-mess/.venv/bin/python",
    args=["server.py"],
    cwd="/home/tanish/code/projects/iitr-campus-intelligence/mcp-mess"
)

async def run_orchestrator():
    print("Connecting to library, academics, events, and mess servers...", flush=True)
    
    # Establish Concurrent Context Managers for the stdio connections
    async with stdio_client(library_params) as (read_lib, write_lib), \
               stdio_client(academics_params) as (read_acad, write_acad), \
               stdio_client(events_params) as (read_ev, write_ev), \
               stdio_client(mess_params) as (read_mess, write_mess):
        
        # Nested context managers for client sessions
        async with ClientSession(read_lib, write_lib) as session_lib, \
                   ClientSession(read_acad, write_acad) as session_acad, \
                   ClientSession(read_ev, write_ev) as session_ev, \
                   ClientSession(read_mess, write_mess) as session_mess:
            
            print("Initializing sessions (MCP Handshake)...", flush=True)
            # Initialize sessions concurrently
            await asyncio.gather(
                session_lib.initialize(),
                session_acad.initialize(),
                session_ev.initialize(),
                session_mess.initialize()
            )
            
            print("Handshakes complete. Aggregating tools...", flush=True)
            # Fetch tools
            lib_tools = await session_lib.list_tools()
            acad_tools = await session_acad.list_tools()
            ev_tools = await session_ev.list_tools()
            mess_tools = await session_mess.list_tools()
            
            # Map tool names to their corresponding sessions
            tool_map = {}
            function_declarations = []
            
            for tool in lib_tools.tools:
                tool_map[tool.name] = session_lib
                function_declarations.append(
                    types.FunctionDeclaration(
                        name=tool.name,
                        description=tool.description,
                        parametersJsonSchema=tool.inputSchema
                    )
                )
            for tool in acad_tools.tools:
                tool_map[tool.name] = session_acad
                function_declarations.append(
                    types.FunctionDeclaration(
                        name=tool.name,
                        description=tool.description,
                        parametersJsonSchema=tool.inputSchema
                    )
                )
            for tool in ev_tools.tools:
                tool_map[tool.name] = session_ev
                function_declarations.append(
                    types.FunctionDeclaration(
                        name=tool.name,
                        description=tool.description,
                        parametersJsonSchema=tool.inputSchema
                    )
                )
            for tool in mess_tools.tools:
                tool_map[tool.name] = session_mess
                function_declarations.append(
                    types.FunctionDeclaration(
                        name=tool.name,
                        description=tool.description,
                        parametersJsonSchema=tool.inputSchema
                    )
                )
                
            print(f"Total tools discovered and registered: {len(function_declarations)}", flush=True)
            
            # Initialize the GenAI Client
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                print("Error: GEMINI_API_KEY is not set in the environment or .env file.", file=sys.stderr, flush=True)
                return
                
            client = genai.Client(api_key=api_key)
            
            # Configure LLM with tools
            config = types.GenerateContentConfig(
                tools=[types.Tool(functionDeclarations=function_declarations)],
                systemInstruction="You are the IITR Campus Assistant. You help students with information from the library, academics (schedules/calendar), events (Thomso), and the hostel mess (menus and prices). Answer questions clearly. When you need information, call the appropriate tools."
            )
            
            # Create a Chat session
            chat = client.chats.create(model="gemini-2.5-flash", config=config)
            
            print("\n=======================================================", flush=True)
            print("   IITR Campus Intelligence Assistant is Ready!        ", flush=True)
            print("=======================================================\n", flush=True)
            
            # Continuous chat loop in terminal
            async def get_user_input() -> str:
                return await asyncio.to_thread(input, "You: ")

            while True:
                try:
                    user_input = await get_user_input()
                    if not user_input.strip():
                        continue
                    if user_input.strip().lower() in ["exit", "quit"]:
                        print("Goodbye!", flush=True)
                        break
                        
                    # Send message to model
                    response = chat.send_message(user_input)
                    
                    # Handle any tool calls requested by the model
                    while response.function_calls:
                        tool_responses = []
                        for call in response.function_calls:
                            name = call.name
                            args = call.args
                            print(f"\n⚙️  Running tool '{name}' with args: {args}...", flush=True)
                            
                            if name in tool_map:
                                session = tool_map[name]
                                try:
                                    # Invoke tool on microservice server
                                    tool_result = await session.call_tool(name, args)
                                    formatted_result = {
                                        "content": [block.model_dump() for block in tool_result.content]
                                    }
                                    print(f"✅ Tool '{name}' returned successfully.", flush=True)
                                except Exception as e:
                                    formatted_result = {"error": str(e)}
                                    print(f"❌ Tool '{name}' failed: {e}", flush=True)
                            else:
                                formatted_result = {"error": f"Tool '{name}' not found."}
                                print(f"⚠️ Tool '{name}' not found.", flush=True)
                                
                            part = types.Part(
                                function_response=types.FunctionResponse(
                                    name=name,
                                    response=formatted_result
                                )
                            )
                            tool_responses.append(part)
                            
                        # Pass the tool outputs back to the model
                        response = chat.send_message(tool_responses)
                        
                    # Print final text response
                    if response.text:
                        print(f"\n🤖 Assistant: {response.text}\n", flush=True)
                    else:
                        print(f"\n🤖 Assistant: [No text response returned]\n", flush=True)
                        
                except (KeyboardInterrupt, EOFError):
                    print("\nGoodbye!", flush=True)
                    break
                except Exception as e:
                    print(f"\nError occurred: {str(e)}\n", flush=True)

def main():
    try:
        asyncio.run(run_orchestrator())
    except KeyboardInterrupt:
        print("\nExiting...", flush=True)

if __name__ == "__main__":
    main()
