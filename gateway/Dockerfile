FROM python:3.11-slim

WORKDIR /app

# uv for fast installs
RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
COPY src ./src

# Install only the base deps (the prod extra requires CUDA + heavy DL libs;
# in a real hospital stack the model containers run separately and the
# gateway just talks to them over HTTP).
RUN uv pip install --system --no-cache .

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
