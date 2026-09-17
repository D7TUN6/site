{ config, pkgs, lib, ... }:

let
  cfg = config.services.d7tun6-radio;
  icecastPass = cfg.icecastSourcePassword;

  icecastXml = pkgs.writeText "d7tun6-icecast.xml" ''
    <?xml version="1.0"?>
    <icecast>
      <hostname>${cfg.domain}</hostname>
      <location>Earth</location>
      <admin>${cfg.domain}</admin>
      <authentication>
        <source-password>${icecastPass}</source-password>
        <relay-password>relay-pass</relay-password>
        <admin-user>admin</admin-user>
        <admin-password>admin-pass</admin-password>
      </authentication>
      <listen-socket>
        <port>8000</port>
        <bind-address>127.0.0.1</bind-address>
      </listen-socket>
      <paths>
        <logdir>/var/log/icecast</logdir>
        <webroot>${pkgs.icecast}/share/icecast/web</webroot>
        <adminroot>${pkgs.icecast}/share/icecast/admin</adminroot>
        <alias source="/" dest="/status.xsl"/>
      </paths>
      <security>
        <chroot>0</chroot>
      </security>
      <fileserve>1</fileserve>
      <http-headers>
        <header name="Access-Control-Allow-Origin" value="*" />
      </http-headers>
      <mount>
        <mount-name>/stream.ogg</mount-name>
        <charset>UTF-8</charset>
        <public>1</public>
        <stream-name>d7tun6 radio</stream-name>
        <stream-description>24/7 d7tun6 broadcast (Ogg Vorbis)</stream-description>
        <stream-url>https://${cfg.domain}/stream.ogg</stream-url>
        <genre>Electronic</genre>
      </mount>
    </icecast>
  '';

  # Shared hardening for radio daemons.
  radioHardening = {
    NoNewPrivileges = true;
    CapabilityBoundingSet = "";
    AmbientCapabilities = "";
    RemoveIPC = true;
    UMask = "0077";

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

    RestrictNamespaces = true;
    LockPersonality = true;
    RestrictRealtime = true;
    RestrictSUIDSGID = true;
    # note: no MemoryDenyWriteExecute — liquidsoap is an OCaml bytecode binary
    # whose runtime allocates writable+executable code fragments at load time.

    RestrictAddressFamilies = "AF_UNIX AF_INET AF_INET6";
    DeviceAllow = "";
    DevicePolicy = "closed";

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
in {
  options.services.d7tun6-radio = {
    enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "enable d7tun6 24/7 radio";
    };
    playlistHost = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "web server host for playlist";
    };
    playlistPort = lib.mkOption {
      type = lib.types.port;
      default = 3001;
      description = "web server port for playlist";
    };
    icecastSourcePassword = lib.mkOption {
      type = lib.types.str;
      default = "changeme-radio-source";
    };
    domain = lib.mkOption {
      type = lib.types.str;
      default = "radio.d7tun6.site";
    };
  };

  config = lib.mkIf cfg.enable {
    # ── icecast server (owned by this module — the upstream
    #    services.icecast option set doesn't expose source-password/mounts) ──
    systemd.services.d7tun6-icecast = {
      description = "d7tun6 icecast streaming server";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];

      serviceConfig = {
        Type = "simple";
        DynamicUser = true;
        Restart = "always";
        RestartSec = 5;

        ExecStart = "${pkgs.icecast}/bin/icecast -c ${icecastXml}";

        LogsDirectory = "icecast";
        StateDirectory = "icecast";

        # ProtectSystem=strict: allow writing to the dirs systemd created
        ReadWritePaths = [ "/var/log/icecast" "/var/lib/icecast" ];
      } // radioHardening;
    };

    # ── packages ──
    environment.systemPackages = [ pkgs.liquidsoap pkgs.curl pkgs.icecast ];

    # ──────────────────────────────────────────────────
    #  LIQUIDSOAP SERVICE — rootless, fully sandboxed
    # ──────────────────────────────────────────────────
    systemd.services.d7tun6-liquidsoap = {
      description = "d7tun6 liquidsoap radio streamer";
      after = [ "d7tun6-icecast.service" "network.target" ];
      wantedBy = [ "multi-user.target" ];

      serviceConfig = {
        Type = "simple";
        Restart = "always";
        RestartSec = "10";

        StateDirectory = "d7tun6-radio";
        RuntimeDirectory = "d7tun6-radio";

        DynamicUser = true;

        # liquidsoap reads config from /etc, needs network to stream.
        # /etc/d7tun6-radio/ is world-readable by default.
        ReadWritePaths = [ "/var/lib/d7tun6-radio" ];
      } // radioHardening;

      script = ''
        export PLAYLIST_HOST="${cfg.playlistHost}"
        export PLAYLIST_PORT="${toString cfg.playlistPort}"
        export ICECAST_HOST="127.0.0.1"
        export ICECAST_PORT="8000"
        export ICECAST_SOURCE_PASSWORD="${icecastPass}"
        export ICECAST_MOUNT="/stream.ogg"

        # fetch playlist from local server into runtime dir (not /tmp)
        ${pkgs.curl}/bin/curl --retry 3 --retry-delay 5 \
          -o /run/d7tun6-radio/playlist.m3u8 \
          "http://${cfg.playlistHost}:${toString cfg.playlistPort}/media/radio/playlist.m3u8"

        exec ${pkgs.liquidsoap}/bin/liquidsoap /etc/d7tun6-radio/liquidsoap.liq
      '';
    };

    # ──────────────────────────────────────────────────
    #  caddy reverse proxy for icecast
    #  (no `encode` block: a live ogg stream isn't compressible and caddy ≥2.11
    #   rejects the old numeric compression levels)
    # ──────────────────────────────────────────────────
    services.caddy.virtualHosts."${cfg.domain}".extraConfig = ''
      header {
        cache-control "public, max-age=300"
        strict-transport-security "max-age=63072000; includesubdomains; preload"
        x-content-type-options "nosniff"
        x-frame-options "deny"
      }
      reverse_proxy 127.0.0.1:8000 {
        transport http {
          read_timeout 600s
          write_timeout 600s
        }
      }
    '';
  };
}
