# AI Services Dockerfile – Slim Cloud Build (Groq + Fish Classifier)
# Removes tensorflow, llama-cpp-python, sentence-transformers, transformers
# Keeps PyTorch CPU + EfficientNet for fish identification
FROM --platform=linux/amd64 python:3.10-slim-bookworm

# Make pip more resilient on slow/flaky networks (large wheels like numpy/torch).
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=300 \
    PIP_RETRIES=20

WORKDIR /app

# Install system dependencies (tesseract for OCR, build tools for native wheels)
# Note: some networks block plain HTTP to deb.debian.org; force HTTPS and retry.
RUN set -eux; \
        if [ -f /etc/apt/sources.list ]; then \
            sed -i 's|http://deb.debian.org|https://deb.debian.org|g; s|http://security.debian.org|https://security.debian.org|g' /etc/apt/sources.list; \
        fi; \
        if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
            sed -i 's|http://deb.debian.org|https://deb.debian.org|g; s|http://security.debian.org|https://security.debian.org|g' /etc/apt/sources.list.d/debian.sources; \
        fi; \
        apt-get -o Acquire::Retries=5 update; \
        apt-get -o Acquire::Retries=5 install -y --no-install-recommends \
            tesseract-ocr \
            build-essential \
        ; \
        rm -rf /var/lib/apt/lists/*

# Copy slim requirements and install
COPY requirements.deploy.txt ./requirements.txt
RUN set -eux; \
    python -m pip install --upgrade pip setuptools wheel; \
    pip install --no-cache-dir --prefer-binary --retries ${PIP_RETRIES} --timeout ${PIP_DEFAULT_TIMEOUT} -r requirements.txt; \
    for i in 1 2 3; do \
        python -m spacy download en_core_web_sm && break; \
        echo "spaCy model download failed; retrying ($i/3)"; \
        sleep 5; \
    done

# Copy application code
COPY . .

# Create model & cache directories
RUN mkdir -p models cache

# Expose port (Render injects $PORT)
EXPOSE 8000

# Health check (FastAPI root returns JSON)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-8000}/')" || exit 1

# Start – respects Render's $PORT env var
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
