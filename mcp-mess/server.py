from mcp.server.fastmcp import FastMCP
import os
import json
from datetime import datetime

# Initialize the FastMCP server instance
mcp = FastMCP("IITR Mess Server")

@mcp.tool()
def get_current_mess_meal(meal_type: str) -> list:
    """
    Get the current day's menu items for a specific meal type (breakfast, lunch, or dinner) at the bhawan mess.

    Args:
        meal_type: The type of the meal to retrieve. Must be one of 'breakfast', 'lunch', or 'dinner'.

    Returns:
        A list of menu items (strings) for the requested meal of the current day.
    """
    meal_type_clean = meal_type.lower().strip()
    if meal_type_clean not in ["breakfast", "lunch", "dinner"]:
        raise ValueError("meal_type must be one of 'breakfast', 'lunch', or 'dinner'")

    # Determine current day of the week
    current_day = datetime.now().strftime("%A")

    # Load bhawan-menu.json (or fallback to bhawan_menus.json)
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    possible_names = ["bhawan-menu.json", "bhawan_menus.json"]
    menu_data = None

    for name in possible_names:
        filepath = os.path.join(data_dir, name)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                menu_data = json.load(f)
            break

    if not menu_data:
        raise FileNotFoundError("Bhawan menu data file not found.")

    daily_menus = menu_data.get("daily_menu", [])
    for day_menu in daily_menus:
        if day_menu.get("day", "").lower() == current_day.lower():
            return day_menu.get(meal_type_clean, [])

    raise ValueError(f"Menu for {current_day} not found in the menu data.")

if __name__ == "__main__":
    mcp.run()
