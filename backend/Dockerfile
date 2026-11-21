# Dockerfile para Backend FastAPI + ChromaDB RAG
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# Instalar dependencias del sistema requeridas para ChromaDB
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# Copiar aplicación, base de conocimiento y entorno base
COPY app/ ./app/
COPY data/ ./data/
COPY .env.example .env

# Exponer puerto 8000
EXPOSE 8000

# Comprobación de salud del contenedor
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

# Comando de ejecución con Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
