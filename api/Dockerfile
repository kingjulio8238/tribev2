FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev ffmpeg git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install tribev2 + API dependencies
COPY . .
RUN pip3 install --no-cache-dir -e ".[plotting]"
RUN pip3 install --no-cache-dir -r api/requirements.txt

# Pre-download model weights (baked into image)
RUN python3 -c "from huggingface_hub import hf_hub_download; hf_hub_download('facebook/tribev2', 'config.yaml'); hf_hub_download('facebook/tribev2', 'best.ckpt')"

# Pre-generate mesh
RUN python3 -c "from tribev2.optimize import pregenerate_mesh; pregenerate_mesh('./mesh_cache')"

# Non-root user
RUN useradd -m appuser && mkdir -p /app/cache /app/mesh_cache /app/uploads /app/jobs && chown -R appuser:appuser /app
USER appuser

# Environment
ENV PYTHONUNBUFFERED=1
ENV VIEWER_URL=https://viewer-juliansaks-gmailcoms-projects.vercel.app

EXPOSE 8000

CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"]
