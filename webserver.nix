{pkgs, lib, ...}: let
  d7tun6SitePath = "/home/d7tun6/files/services/site/d7tun6";
  thecomboxSitePath = "/home/d7tun6/files/services/site/thecombox";
  botPath = "/home/d7tun6/files/services/bot";
  minioAccessKey = "minioadmin";
  minioSecretKey = "minioadmin123";

  pythonEnv2 = pkgs.python3.withPackages (ps:
    with ps; [
      python-telegram-bot
      apscheduler
      pyopenssl
      cryptography
    ]);
in {
  # The site service now rebuilds the Vite app and mirrors media to MinIO on
  # startup, so container boot needs a longer timeout than the default.
  systemd.services."container@webserver".serviceConfig.TimeoutStartSec = lib.mkForce "60min";

  containers.webserver = {
    autoStart = true;
    privateNetwork = false;
    hostAddress = "192.168.100.10";
    localAddress = "192.168.100.11";

    bindMounts = {
      "/var/www/d7tun6.site" = {
        hostPath = d7tun6SitePath;
        isReadOnly = false;
      };
      "/var/www/thecombox.site" = {
        hostPath = thecomboxSitePath;
        isReadOnly = false;
      };
      "/var/www/bot" = {
        hostPath = botPath;
        isReadOnly = false;
      };
    };

    config = {
      config,
      pkgs,
      lib,
      ...
    }: {
      systemd.tmpfiles.rules = [
        "d /var/www/d7tun6.site 0755 d7tun6 users -"
        "d /var/www/d7tun6.site/node_modules 0755 d7tun6 users -"
        "d /var/www/d7tun6.site/dist 0755 d7tun6 users -"
        "d /var/www/thecombox.site 0755 d7tun6 users -"
        "d /var/www/thecombox.site/node_modules 0755 d7tun6 users -"
        "d /var/www/thecombox.site/dist 0755 d7tun6 users -"
        "d /var/lib/d7tun6 0755 d7tun6 users -"
        "d /var/lib/d7tun6/.npm 0755 d7tun6 users -"
        "d /var/lib/thecombox 0755 d7tun6 users -"
        "d /var/lib/thecombox/.npm 0755 d7tun6 users -"
        "d /var/lib/minio 0755 minio minio -"
      ];
      system.stateVersion = "24.11";
      time.timeZone = "Asia/Yekaterinburg";
      users.users.d7tun6 = {
        isNormalUser = true;
        group = "users";
        home = "/var/lib/d7tun6";
        createHome = true;
      };
      users.groups.d7tun6 = {};
      users.users.minio = {
        isSystemUser = true;
        group = "minio";
        home = "/var/lib/minio";
        createHome = true;
      };
      users.groups.minio = {};
      networking = {
        nameservers = lib.mkForce [
          "8.8.8.8"
          "1.1.1.1"
        ];
        firewall = {
          allowedTCPPorts = [
            443
            80
          ];
          allowedUDPPorts = [
            443
            80
          ];
        };
      };
      services.nginx = {
        enable = true;
        recommendedProxySettings = true;
        recommendedTlsSettings = true;
        recommendedGzipSettings = true;

        virtualHosts = {
          "d7tun6.site" = {
            forceSSL = true;
            enableACME = true;
            extraConfig = ''
              add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
            '';
            # Keep normal site media on the app server. Only MinIO-backed
            # generated downloads should go through the object storage proxy.
            locations."/media-cache/" = {
              proxyPass = "http://127.0.0.1:9000/media/";
              extraConfig = ''
                proxy_http_version 1.1;
                proxy_set_header Host 127.0.0.1:9000;
                proxy_set_header X-Forwarded-Proto $scheme;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Forwarded-Host $host;
                proxy_set_header Upgrade "";
                proxy_set_header Connection "";
                proxy_hide_header Strict-Transport-Security;
                proxy_read_timeout 600s;
                proxy_send_timeout 600s;
              '';
            };
            locations."/" = {
              proxyPass = "http://127.0.0.1:3001";
              proxyWebsockets = true;
              extraConfig = ''
                proxy_hide_header Strict-Transport-Security;
                proxy_read_timeout 300s;
                proxy_send_timeout 300s;
              '';
            };
          };
          "thecombox.site" = {
            addSSL = true;
            enableACME = true;
            extraConfig = ''
              add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
            '';
            locations."/" = {
              proxyPass = "http://127.0.0.1:3002";
              proxyWebsockets = true;
              extraConfig = ''
                proxy_hide_header Strict-Transport-Security;
                proxy_read_timeout 300s;
                proxy_send_timeout 300s;
              '';
            };
          };
          "combox.thecombox.site" = {
            forceSSL = true;
            enableACME = true;
            extraConfig = ''
              add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
            '';
            locations."/" = {
              proxyPass = "http://127.0.0.1:5443";
              proxyWebsockets = true;
              extraConfig = ''
                proxy_hide_header Strict-Transport-Security;
                proxy_read_timeout 300s;
                proxy_send_timeout 300s;
              '';
            };
          };
        };
      };

      services.postfix = {
        enable = true;
        settings.main = {
          inet_interfaces = "loopback-only";
          myhostname = "d7tun6.site";
          mydomain = "d7tun6.site";
          myorigin = "$mydomain";
          mydestination = [
            "localhost"
            "localhost.localdomain"
          ];
          mynetworks = [
            "127.0.0.0/8"
            "::1"
          ];
          smtpd_recipient_restrictions = [
            "permit_mynetworks"
            "reject_unauth_destination"
          ];
          smtpd_relay_restrictions = [
            "permit_mynetworks"
            "reject_unauth_destination"
          ];
        };
      };

      environment.systemPackages = [
        pkgs.nodejs_24
        # pkgs.nodePackages.npm
        pkgs.coreutils
        pkgs.bash
        pkgs.procps
        pkgs.psmisc
        pkgs.ffmpeg
        pkgs.git
        pkgs.curl
        pkgs.cacert
        pkgs.openssl
        pkgs.pkg-config
        pkgs.woff2
        pkgs.jq
        pkgs.minio
        pkgs.minio-client
      ];

      systemd.services.minio = {
        wantedBy = ["multi-user.target"];
        after = ["network-online.target"];
        wants = ["network-online.target"];

        path = [
          pkgs.minio
          pkgs.minio-client
          pkgs.coreutils
          pkgs.bash
        ];

        environment = {
          MINIO_ROOT_USER = minioAccessKey;
          MINIO_ROOT_PASSWORD = minioSecretKey;
        };

        serviceConfig = {
          User = "minio";
          Group = "minio";
          WorkingDirectory = "/var/lib/minio";
          ExecStart = "${pkgs.minio}/bin/minio server --address 127.0.0.1:9000 --console-address 127.0.0.1:9001 /var/lib/minio";
          Restart = "on-failure";
          RestartSec = 5;
          ReadWritePaths = ["/var/lib/minio"];
        };
      };

      systemd.services.d7tun6-site = {
        wantedBy = ["multi-user.target"];
        after = ["network-online.target" "minio.service"];
        wants = ["network-online.target" "minio.service"];

        path = [
          pkgs.nodejs_24
          # pkgs.nodePackages.npm
          pkgs.coreutils
          pkgs.bash
          pkgs.procps
          pkgs.psmisc
          pkgs.ffmpeg
          pkgs.git
          pkgs.curl
          pkgs.cacert
          pkgs.openssl
          pkgs.pkg-config
          pkgs.woff2
          pkgs.jq
          pkgs.minio-client
          # pkgs.nodePackages.pnpm
        ];

        environment = {
          NODE_ENV = "production";
          PORT = "3001";
          HOSTNAME = "127.0.0.1";
          APP_ORIGIN = "https://d7tun6.site";
          SMTP_HOST = "127.0.0.1";
          SMTP_PORT = "25";
          SMTP_FROM = "D7TUN6.site <no-reply@d7tun6.site>";
          SMTP_SECURE = "false";
          HOME = "/var/lib/d7tun6";
          npm_config_cache = "/var/lib/d7tun6/.npm";
          MINIO_ALIAS = "local";
          MINIO_ENDPOINT = "http://127.0.0.1:9000";
          MINIO_BUCKET = "media";
          MINIO_ROOT_USER = minioAccessKey;
          MINIO_ROOT_PASSWORD = minioSecretKey;
          SHELL = "${pkgs.bash}/bin/bash";
        };

        serviceConfig = {
          User = "d7tun6";
          Group = "users";
          WorkingDirectory = "/var/www/d7tun6.site";

          ExecStartPre = [
            "${pkgs.coreutils}/bin/mkdir -p /var/www/d7tun6.site/node_modules /var/www/d7tun6.site/dist /var/lib/d7tun6/.npm"
            "-${pkgs.psmisc}/bin/fuser -k 3001/tcp"
            "-${pkgs.procps}/bin/pkill -f 'node server/index.mjs'"
          ];

          ExecStart = "${pkgs.bash}/bin/bash -c '${pkgs.nodejs_24}/bin/npm ci --include=dev --no-audit --no-fund && ${pkgs.nodejs_24}/bin/npm run build && ${pkgs.nodejs_24}/bin/npm run sync:media-storage && exec ${pkgs.nodejs_24}/bin/node /var/www/d7tun6.site/server/index.mjs'";

          Restart = "on-failure";
          RestartSec = 15;
          TimeoutStartSec = "15min";

          ReadWritePaths = [
            "/var/www/d7tun6.site"
            "/var/lib/d7tun6"
          ];
        };
      };

      systemd.services.thecombox-site = {
        wantedBy = ["multi-user.target"];
        after = ["network-online.target"];
        wants = ["network-online.target"];

        path = [
          pkgs.nodejs_24
          # pkgs.nodePackages.npm
          pkgs.coreutils
          pkgs.bash
          pkgs.procps
          pkgs.psmisc
          pkgs.ffmpeg
        ];

        environment = {
          NODE_ENV = "production";
          PORT = "3002";
          HOSTNAME = "127.0.0.1";
          HOME = "/var/lib/thecombox";
          npm_config_cache = "/var/lib/thecombox/.npm";
          SHELL = "${pkgs.bash}/bin/bash";
        };

        serviceConfig = {
          User = "d7tun6";
          Group = "users";
          WorkingDirectory = "/var/www/thecombox.site";

          ExecStartPre = [
            "${pkgs.coreutils}/bin/mkdir -p /var/www/thecombox.site/node_modules /var/www/thecombox.site/dist /var/lib/thecombox/.npm"
            "-${pkgs.psmisc}/bin/fuser -k 3002/tcp"
            "-${pkgs.procps}/bin/pkill -f 'node server/index.mjs'"
            "${pkgs.nodejs_24}/bin/npm ci --include=dev --no-audit --no-fund"
          ];
          ExecStart = "${pkgs.nodejs_24}/bin/node /var/www/thecombox.site/server/index.mjs";

          Restart = "on-failure";
          RestartSec = 5;
          TimeoutStartSec = "15min";
          PrivateTmp = true;
          ProtectSystem = "strict";
          ProtectHome = false;
          ReadWritePaths = [
            "/var/www/thecombox.site"
            "/var/lib/thecombox"
          ];
          NoNewPrivileges = true;
        };
      };

      systemd.services.bot = {
        wantedBy = ["multi-user.target"];
        after = ["network.target"];

        environment = {
          PYTHONUNBUFFERED = "1";
        };

        serviceConfig = {
          User = "d7tun6";
          Group = "users";
          WorkingDirectory = "/var/www/bot";

          ExecStart = "${pythonEnv2}/bin/python b.py";

          Restart = "always";
          ProtectSystem = "strict";
          ProtectHome = true;
          PrivateTmp = true;
          ReadWritePaths = ["/var/www/bot"];
          NoNewPrivileges = true;
          CapabilityBoundingSet = "";
        };
      };

      security.acme = {
        acceptTerms = true;
        defaults.email = "d7tun6@gmail.com";
      };
    };
  };
}
