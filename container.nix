{
  config,
  pkgs,
  lib,
  ...
}: let
  d7tun6SitePath = "/home/d7tun6/files/services/site/d7tun6";
  thecomboxSitePath = "/home/d7tun6/files/services/site/thecombox";
  boxchatPath = "/home/d7tun6/files/services/boxchat";

  pythonEnv = pkgs.python3.withPackages (ps:
    with ps; [
      flask
      flask-socketio
      flask-sqlalchemy
      flask-login
      eventlet
      pillow
      gunicorn
      python-socketio
      python-engineio
      python-dotenv
    ]);
in {
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
        isReadOnly = true;
      };
      "/var/www/boxchat" = {
        hostPath = boxchatPath;
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
        "d /var/www/boxchat 0755 d7tun6 users -"
        "d /var/lib/d7tun6 0755 d7tun6 users -"
        "d /var/lib/d7tun6/.npm 0755 d7tun6 users -"
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

        virtualHosts = {
          "d7tun6.site" = {
            addSSL = true;
            enableACME = true;
            locations."/" = {
              proxyPass = "http://127.0.0.1:3001";
              proxyWebsockets = true;
              extraConfig = ''
                proxy_read_timeout 300s;
                proxy_send_timeout 300s;
              '';
            };
          };
          "thecombox.site" = {
            addSSL = true;
            enableACME = true;
            root = "/var/www/thecombox.site";
          };
          "boxchat.thecombox.site" = {
            addSSL = true;
            enableACME = true;
            locations = {
              "/" = {
                proxyPass = "http://127.0.0.1:5000";
                proxyWebsockets = true;
              };
              "/socket.io/" = {
                proxyPass = "http://127.0.0.1:5000";
                proxyWebsockets = true;
                extraConfig = ''
                  proxy_read_timeout 7d;
                  proxy_send_timeout 7d;
                '';
              };
            };
          };
        };
      };

      systemd.services.d7tun6-site = {
        wantedBy = ["multi-user.target"];
        after = ["network-online.target"];
        wants = ["network-online.target"];

        path = [
          pkgs.nodejs_24
          pkgs.nodePackages.npm
          pkgs.coreutils
          pkgs.bash
          pkgs.procps
          pkgs.psmisc
          pkgs.ffmpeg
        ];

        environment = {
          NODE_ENV = "production";
          PORT = "3001";
          HOSTNAME = "127.0.0.1";
          HOME = "/var/lib/d7tun6";
          npm_config_cache = "/var/lib/d7tun6/.npm";
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
            "${pkgs.nodejs_24}/bin/npm ci --include=dev --no-audit --no-fund"
            "${pkgs.nodejs_24}/bin/npm run build"
          ];
          ExecStart = "${pkgs.nodejs_24}/bin/node /var/www/d7tun6.site/server/index.mjs";

          Restart = "on-failure";
          RestartSec = 5;
          PrivateTmp = true;
          ProtectSystem = "strict";
          ProtectHome = false;
          ReadWritePaths = [
            "/var/www/d7tun6.site"
            "/var/lib/d7tun6"
          ];
          NoNewPrivileges = true;
        };
      };

      systemd.services.boxchat = {
        wantedBy = ["multi-user.target"];
        after = ["network.target"];

        environment = {
          PYTHONUNBUFFERED = "1";
          FLASK_APP = "run.py";
        };

        serviceConfig = {
          User = "d7tun6";
          Group = "users";
          WorkingDirectory = "/var/www/boxchat";

          ExecStart = "${pythonEnv}/bin/gunicorn --worker-class eventlet -w 1 --bind 127.0.0.1:5000 run:app";

          Restart = "always";
          ProtectSystem = "strict";
          ProtectHome = true;
          PrivateTmp = true;
          ReadWritePaths = ["/var/www/boxchat"];
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
