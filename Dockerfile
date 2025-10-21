# Use the official NVIDIA CUDA image as the base
# This provides the Linux environment, Python, and NVIDIA drivers
FROM nvidia/cuda:12.1.1-devel-ubuntu22.04

# Set the working directory inside the container
WORKDIR /app

# Set ENV to prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install Python 3, pip, and git
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    git && \
    rm -rf /var/lib/apt/lists/*

# Install Petals.
# This will correctly install 'uvloop' and all other dependencies
# inside the Linux environment.
RUN pip3 install petals

# Copy your local seeder script into the container
# This assumes your script is at src-tauri/py/run_petals_seeder.py
COPY src-tauri/py/run_petals_seeder.py .

# Set the default command to run when the container starts
# This will execute your Python script
ENTRYPOINT ["python3", "run_petals_seeder.py"]