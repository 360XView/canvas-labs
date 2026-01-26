# Lab Environment Docker Image
# Ubuntu 22.04 with SSH server and command logging

FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages
RUN apt-get update && apt-get install -y \
    openssh-server \
    sudo \
    vim \
    nano \
    less \
    man-db \
    bash-completion \
    && rm -rf /var/lib/apt/lists/*

# Configure SSH server
RUN mkdir /var/run/sshd
RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Create student user with sudo access
RUN useradd -m -s /bin/bash -G sudo student
RUN echo 'student:student' | chpasswd
RUN echo 'root:root' | chpasswd

# Allow student to use sudo without password
RUN echo 'student ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Set default home directory permissions to 755 (not 750)
# This way students must explicitly chmod to 750
RUN sed -i 's/^HOME_MODE.*/HOME_MODE 0755/' /etc/login.defs || echo 'HOME_MODE 0755' >> /etc/login.defs

# Set up SSH authorized_keys for student (empty for now, can be mounted)
RUN mkdir -p /home/student/.ssh
RUN chmod 700 /home/student/.ssh
RUN touch /home/student/.ssh/authorized_keys
RUN chmod 600 /home/student/.ssh/authorized_keys
RUN chown -R student:student /home/student/.ssh

# Copy command logging script to profile.d (for login shells)
COPY scripts/log-commands.sh /etc/profile.d/log-commands.sh
RUN chmod 644 /etc/profile.d/log-commands.sh

# Also source it from bash.bashrc (for all interactive shells including sudo su)
RUN echo 'source /etc/profile.d/log-commands.sh' >> /etc/bash.bashrc

# Ensure root shell also logs commands
RUN echo 'source /etc/profile.d/log-commands.sh' >> /root/.bashrc

# Create log directory
RUN mkdir -p /var/log/lab-commands
RUN chmod 777 /var/log/lab-commands

# Copy lab orchestrator and helper scripts
COPY scripts/lab-orchestrator.sh /usr/local/bin/lab-orchestrator.sh
COPY scripts/log-check-result.sh /usr/local/bin/log-check-result.sh
RUN chmod +x /usr/local/bin/lab-orchestrator.sh /usr/local/bin/log-check-result.sh

# Copy lab modules (setup scripts and check scripts are inside each module)
# The labs/ directory is copied by build.sh before docker build
COPY labs/ /opt/lab/modules/
RUN find /opt/lab/modules -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true

# Default module (can be overridden with -e LAB_MODULE_ID=...)
ENV LAB_MODULE_ID=linux-user-management

# Expose SSH port
EXPOSE 22

# Entry point: run orchestrator as root (for setup), then keep container alive
# The orchestrator sets up the lab and starts check polling
# Container stays alive via tail, interactive access via 'docker exec -it <id> su - student'
ENTRYPOINT ["/bin/bash", "-c", "/usr/local/bin/lab-orchestrator.sh &>/var/log/lab-commands/orchestrator.log & tail -f /dev/null"]
