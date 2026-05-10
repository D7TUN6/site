{ pkgs, ... }:
let
  siteRoot = "/var/www/d7tun6.site";
  siteUser = "d7tun6";
  siteGroup = "users";
  siteHost = "127.0.0.1";
  sitePort = "3001";
  siteOrigin = "https://d7tun6.site";
in
{
  systemd.services.d7tun6-site = {
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];

    path = [
      pkgs.nodejs_24
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
    ];

    environment = {
      NODE_ENV = "production";
      PORT = sitePort;
      HOSTNAME = siteHost;
      APP_ORIGIN = siteOrigin;
      DB_PATH = "/var/lib/d7tun6/app.db";
      HOME = "/var/lib/d7tun6";
      npm_config_cache = "/var/lib/d7tun6/.npm";
      SHELL = "${pkgs.bash}/bin/bash";
    };

    serviceConfig = {
      User = siteUser;
      Group = siteGroup;
      WorkingDirectory = siteRoot;

      ExecStartPre = [
        "${pkgs.coreutils}/bin/mkdir -p /var/lib/d7tun6 /var/lib/d7tun6/.npm"
        "${pkgs.nodejs_24}/bin/npm ci --include=dev --no-audit --no-fund"
        "${pkgs.nodejs_24}/bin/npm run build"
      ];

      ExecStart = "${pkgs.nodejs_24}/bin/node --env-file=.env dist-server/server/index.js";
      Restart = "on-failure";
      RestartSec = 10;
      TimeoutStartSec = "20min";
      ReadWritePaths = [ siteRoot "/var/lib/d7tun6" ];
      NoNewPrivileges = true;
      PrivateTmp = true;
      ProtectHome = false;
      ProtectSystem = "strict";
    };
  };

  services.nginx = {
    enable = true;
    recommendedGzipSettings = true;
    recommendedProxySettings = true;
    recommendedTlsSettings = true;

    virtualHosts."d7tun6.site" = {
      forceSSL = true;
      enableACME = true;
      extraConfig = ''
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
      '';

      locations."/" = {
        proxyPass = "http://${siteHost}:${sitePort}";
        proxyWebsockets = true;
        extraConfig = ''
          proxy_read_timeout 300s;
          proxy_send_timeout 300s;
          proxy_hide_header Strict-Transport-Security;
        '';
      };
    };
  };

  security.acme = {
    acceptTerms = true;
    defaults.email = "admin@d7tun6.site";
  };
}
