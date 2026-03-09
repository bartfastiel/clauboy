FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm-256color
ENV COLORTERM=truecolor
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

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
    tmux \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install ttyd (latest release)
RUN TTYD_VERSION=$(curl -s https://api.github.com/repos/tsl0922/ttyd/releases/latest | jq -r '.tag_name') \
    && wget -qO /usr/local/bin/ttyd "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.x86_64" \
    && chmod +x /usr/local/bin/ttyd

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user (required by claude --dangerously-skip-permissions)
RUN useradd -m -s /bin/bash agent

# Set working directory and grant ownership
WORKDIR /workspace
RUN chown agent:agent /workspace

# Copy entrypoint before switching user
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER agent

# Configure git for the agent user
RUN git config --global user.email "clauboy@agent.local" && \
    git config --global user.name "Clauboy Agent" && \
    git config --global --add safe.directory /workspace

# Pre-seed Claude Code settings: skip first-run wizard and pre-approve all tools
# so containers run autonomously without per-command permission prompts
RUN mkdir -p /home/agent/.claude && \
    printf '%s\n' \
      '{' \
      '  "theme": "dark",' \
      '  "permissions": {' \
      '    "allow": ["Bash(*)", "Read(*)", "Write(*)", "Edit(*)", "MultiEdit(*)", "Glob(*)", "Grep(*)", "WebFetch(*)", "WebSearch(*)", "TodoWrite(*)", "TodoRead(*)"],' \
      '    "deny": []' \
      '  }' \
      '}' > /home/agent/.claude/settings.json

EXPOSE 7681

ENTRYPOINT ["/entrypoint.sh"]
