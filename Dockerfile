# Use an official lightweight Python image
FROM python:3.11-slim

# Set the working directory to the repository root
WORKDIR /app

# Copy the entire repository contents into the container
COPY . .

# Run your chained pip installations globally
RUN pip install --no-cache-dir \
    -r campus-assistant-orchestrator/requirements.txt \
    -r mcp-academics/requirements.txt \
    -r mcp-events/requirements.txt \
    -r mcp-library/requirements.txt \
    -r mcp-mess/requirements.txt

# Expose the dynamic port
EXPOSE 8000

# Start the Uvicorn application
CMD ["sh", "-c", "uvicorn campus-assistant-orchestrator.api:app --host 0.0.0.0 --port ${PORT:-8000}"]