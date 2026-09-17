{ config, pkgs, lib, ... }:

let
  cfg = config.services.d7tun6;
  appDir = cfg.appDir;

  # Shared hardening defaults for all d7tun6 systemd services.
  # MemoryDenyWriteExecute=false is REQUIRED: Bun JIT writes+executes memory pages.
  commonHardening = {
    # ── Identity & Privileges ──
    NoNewPrivileges = true;
    CapabilityBoundingSet = "";
    AmbientCapabilities = "";
    RemoveIPC = true;
    UMask = "0077";

    # ── Filesystem ──
    ProtectSystem = "strict";
    ProtectHome = true;
    PrivateTmp = true;
    PrivateDevices = true;
    ProtectHostname = true;
    ProtectClock = true;
    ProtectKernelTunables = true;
    ProtectKernelModules = true;
    ProtectKernelLogs = true;
    ProtectControlGroups = true;
    ProtectProc = "invisible";
    ProcSubset = "pid";

    # ── Namespaces & Scheduling ──
    RestrictNamespaces = true;
    LockPersonality = true;
    RestrictRealtime = true;
    RestrictSUIDSGID = true;
    MemoryDenyWriteExecute = false; # Bun JIT

    # ── Addresses & Devices ──
    RestrictAddressFamilies = "AF_UNIX AF_INET AF_INET6";
    DeviceAllow = "";
    DevicePolicy = "closed";

    # ── Syscalls: allow @system-service, deny dangerous groups ──
    SystemCallArchitectures = "native";
    SystemCallFilter = [
      "@system-service"
      "~@privileged"
      "~@resources"
      "~@obsolete"
      "~@clock"
      "~@cpu-emulation"
      "~@debug"
      "~@module"
      "~@mount"
      "~@raw-io"
      "~@reboot"
      "~@swap"
    ];
  };

  # Extra hardening for long-running daemons (not build).
  # PrivateUsers omitted: DynamicUser=true already provides user isolation;
  # combining both creates a nested user namespace that breaks UID mapping.
  daemonHardening = commonHardening // {
    PrivateNetwork = false; # web server needs network
  };
in {
  imports = [
    ./radio/nixos-module.nix
  ];

  options.services.d7tun6 = {
    enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "enable d7tun6 site (web app + worker + radio)";
    };

    appDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/www/d7tun6.site";
      description = "application root directory (source tree)";
    };

    domain = lib.mkOption {
      type = lib.types.str;
      default = "d7tun6.site";
      description = "primary domain";
    };

    appPort = lib.mkOption {
      type = lib.types.port;
      default = 3001;
      description = "internal web server port";
    };

    appSecret = lib.mkOption {
      type = lib.types.str;
      default = "change-me-to-a-long-random-string";
      description = "APP_SECRET for sessions";
    };

    jwtSecret = lib.mkOption {
      type = lib.types.str;
      default = "change-me-jwt-secret";
      description = "JWT secret for admin auth";
    };

    adminEmail = lib.mkOption {
      type = lib.types.str;
      default = "admin@d7tun6.site";
    };

    adminPassword = lib.mkOption {
      type = lib.types.str;
      default = "change-me";
    };

    redisUrl = lib.mkOption {
      type = lib.types.str;
      default = "redis://127.0.0.1:6379";
      description = "redis url (local or upstash)";
    };

    upstashRedisUrl = lib.mkOption {
      type = lib.types.str;
      default = "";
      description = "upstash redis rest url (leave empty for local redis)";
    };

    upstashRedisToken = lib.mkOption {
      type = lib.types.str;
      default = "";
    };

    icecastSourcePassword = lib.mkOption {
      type = lib.types.str;
      default = "changeme-radio-source";
    };

    yookassaShopId = lib.mkOption {
      type = lib.types.str;
      default = "";
    };

    yookassaSecretKey = lib.mkOption {
      type = lib.types.str;
      default = "";
    };

    smtpHost = lib.mkOption {
      type = lib.types.str;
      default = "";
    };

    smtpPort = lib.mkOption {
      type = lib.types.str;
      default = "587";
    };

    smtpUser = lib.mkOption {
      type = lib.types.str;
      default = "";
    };

    smtpPass = lib.mkOption {
      type = lib.types.str;
      default = "";
    };

    smtpFrom = lib.mkOption {
      type = lib.types.str;
      default = "D7TUN6.site <no-reply@d7tun6.site>";
    };

    enableAcme = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "enable letsencrypt tls via acme";
    };

    caddyDomain = lib.mkOption {
      type = lib.types.str;
      default = "";
      description = "caddy virtual host domain (leave empty to skip caddy)";
    };

    workerPackages = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = with pkgs; [ nodejs_24 ffmpeg ];
      description = "packages for the background worker";
    };
  };

  config = lib.mkIf cfg.enable {
    # ── radio submodule ──
    services.d7tun6-radio = {
      enable = true;
      inherit (cfg) icecastSourcePassword;
      domain = "${builtins.replaceStrings ["."] ["."] cfg.domain}";
    };

    # ── packages ──
    environment.systemPackages = with pkgs; [
      nodejs_24 bun ffmpeg git curl jq pm2
    ];

    # ── .env file generation (read-only, mode 0400) ──
    environment.etc."d7tun6-env" = {
      text = ''
        APP_SECRET="${cfg.appSecret}"
        JWT_SECRET="${cfg.jwtSecret}"
        APP_ORIGIN="https://${cfg.domain}"
        ADMIN_EMAIL="${cfg.adminEmail}"
        ADMIN_PASSWORD="${cfg.adminPassword}"
        WEB_PORT="${toString cfg.appPort}"

        REDIS_URL="${cfg.redisUrl}"
        UPSTASH_REDIS_URL="${cfg.upstashRedisUrl}"
        UPSTASH_REDIS_TOKEN="${cfg.upstashRedisToken}"

        VITE_SITE_TITLE="d7tun6.site"

        YOOKASSA_SHOP_ID="${cfg.yookassaShopId}"
        YOOKASSA_SECRET_KEY="${cfg.yookassaSecretKey}"
        YOOKASSA_RETURN_URL="https://${cfg.domain}/ru/account"

        SMTP_HOST="${cfg.smtpHost}"
        SMTP_PORT="${cfg.smtpPort}"
        SMTP_USER="${cfg.smtpUser}"
        SMTP_PASS="${cfg.smtpPass}"
        SMTP_FROM="${cfg.smtpFrom}"

        ICECAST_SOURCE_PASSWORD="${cfg.icecastSourcePassword}"
        ICECAST_HOSTNAME="radio.${cfg.domain}"
      '';
      mode = "0400";
    };

    # ── redis (local) ──
    services.redis.servers.d7tun6 = {
      enable = true;
      port = 6379;
      bind = "127.0.0.1";
    };

    # ──────────────────────────────────────────────────
    #  BUILD SERVICE (oneshot + timer)
    # ──────────────────────────────────────────────────
    systemd.services.d7tun6-build = {
      description = "d7tun6 site build (frontend + server)";
      path = with pkgs; [ bun nodejs_24 git ];
      environment = { HOME = "/var/lib/d7tun6"; };

      serviceConfig = {
        Type = "oneshot";
        WorkingDirectory = appDir;
        StateDirectory = "d7tun6";
        EnvironmentFile = "/etc/d7tun6-env";

        # Rootless: DynamicUser creates a transient d7tun6-build user.
        DynamicUser = true;
      } // commonHardening;

      script = ''
        bun install --frozen-lockfile
        bun run build
      '';
    };

    systemd.timers.d7tun6-build = {
      description = "d7tun6 periodic rebuild";
      wantedBy = [ "multi-user.target" ];
      timerConfig = {
        OnCalendar = "hourly";
        Persistent = true;
        RandomizedDelaySec = 300;
      };
    };

    # ──────────────────────────────────────────────────
    #  PM2 SERVICE (web cluster + worker) — rootless
    # ──────────────────────────────────────────────────
    systemd.services.d7tun6-pm2 = {
      description = "d7tun6 pm2 process manager (web cluster + worker)";
      after = [ "network.target" "redis-d7tun6.service" "d7tun6-build.service" ];
      wantedBy = [ "multi-user.target" ];
      path = cfg.workerPackages ++ [ pkgs.bun pkgs.pm2 pkgs.coreutils pkgs.glibc pkgs.procps ];

      serviceConfig = {
        Type = "simple";
        WorkingDirectory = appDir;
        EnvironmentFile = "/etc/d7tun6-env";
        StateDirectory = "d7tun6";
        RuntimeDirectory = "d7tun6";

        TimeoutStartSec = 60;
        TimeoutStopSec = 30;
        Restart = "on-failure";
        RestartSec = 5;

        ExecStartPre = pkgs.writeShellScript "pm2-prestart" ''
          mkdir -p /var/lib/d7tun6/logs
        '';
        ExecStart = "${pkgs.pm2}/bin/pm2-runtime ecosystem.config.js --env production";
        ExecStopPost = "${pkgs.pm2}/bin/pm2 kill";

        # Rootless: DynamicUser creates a transient d7tun6-pm2 user.
        DynamicUser = true;

        # bun-app needs the source tree to be readable and writable (node_modules, dist).
        # ProtectSystem=strict mounts / as read-only, so we explicitly allow appDir.
        ReadWritePaths = [ appDir "/var/lib/d7tun6" ];
      } // daemonHardening;
    };
  };
}
