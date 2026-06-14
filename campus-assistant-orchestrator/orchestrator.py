import asyncio
import os
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

async def run_orchestrator():
    print("Connecting to microservice servers...")
    
    # Establish Concurrent Context Managers for the stdio connections
    async with stdio_client(library_params) as (read_lib, write_lib), \
               stdio_client(academics_params) as (read_acad, write_acad), \
               stdio_client(events_params) as (read_ev, write_ev):
        
        print("Connected streams. Establishing Client Sessions...")
        
        # Nested context managers for client sessions
        async with ClientSession(read_lib, write_lib) as session_lib, \
                   ClientSession(read_acad, write_acad) as session_acad, \
                   ClientSession(read_ev, write_ev) as session_ev:
            
            print("Initializing sessions (MCP Handshake)...")
            
            # Initialize sessions concurrently
            await asyncio.gather(
                session_lib.initialize(),
                session_acad.initialize(),
                session_ev.initialize()
            )
            
            print("Handshakes complete. Fetching registered tools...")
            
            # Query tool lists from each server to verify connection
            lib_tools = await session_lib.list_tools()
            acad_tools = await session_acad.list_tools()
            ev_tools = await session_ev.list_tools()
            
            print("\n=== Library Server Tools ===")
            for tool in lib_tools.tools:
                print(f"- {tool.name}: {tool.description}")
                
            print("\n=== Academics Server Tools ===")
            for tool in acad_tools.tools:
                print(f"- {tool.name}: {tool.description}")
                
            print("\n=== Events Server Tools ===")
            for tool in ev_tools.tools:
                print(f"- {tool.name}: {tool.description}")

def main():
    asyncio.run(run_orchestrator())

if __name__ == "__main__":
    main()
