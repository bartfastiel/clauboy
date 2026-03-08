FROM node:24-bookworm-slim

# Install system tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    unzip \
    ca-certificates \
    gnupg \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user (required by claude --dangerously-skip-permissions)
RUN useradd -m -s /bin/bash agent

# Set working directory and grant ownership
WORKDIR /workspace
RUN chown agent:agent /workspace

USER agent

# Configure git for the agent user
RUN git config --global user.email "clauboy@agent.local" && \
    git config --global user.name "Clauboy Agent" && \
    git config --global --add safe.directory /workspace

# Default command
CMD ["claude", "--dangerously-skip-permissions"]
