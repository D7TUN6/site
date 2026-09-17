{pkgs ? import <nixpkgs> {}}: let
  nix-bun-src = builtins.fetchTarball {
    url = "https://github.com/ryoppippi/nix-bun/archive/ea36a1495f19a50351cad661d45846173782b138.tar.gz";
    sha256 = "sha256-TuajTo1etVvm8PiHVMMWhXpu2JgYMzCow0n94caXlp8=";
  };
  bun = pkgs.callPackage "${nix-bun-src}/package.nix" {
    sourcesFile = "${nix-bun-src}/versions/1.4.2.json";
  };
in
  pkgs.mkShell {
    name = "d7tun6-site-shell";

    buildInputs = [
      bun
      pkgs.nodejs_24
      pkgs.git
      pkgs.jq
      pkgs.curl
      pkgs.cacert
      pkgs.openssl
      pkgs.pkg-config
      pkgs.ffmpeg
      pkgs.swaks
      pkgs.woff2
      pkgs.redis
      pkgs.rclone
      pkgs.stdenv.cc.cc.lib
    ];

    shellHook = ''
      # sharp (native libvips) needs libstdc++ at runtime.
      export LD_LIBRARY_PATH=${pkgs.stdenv.cc.cc.lib}/lib:''${LD_LIBRARY_PATH:+$LD_LIBRARY_PATH}
      echo "d7tun6 dev shell (bun from ryoppippi/nix-bun)"
      echo ""
      echo "── dev ──"
      echo "  bun install            install deps"
      echo "  bun run dev            vite + api (localhost:5173)"
      echo "  bun run build          full production build"
      echo "  bun run test           run test suite"
      echo "  bun run typecheck      typescript checks"
      echo ""
      echo "── background ──"
      echo "  cd worker && bun start           background worker (ffmpeg)"
      echo "  cd packages/admin && bun run dev admin panel (port 5174)"
      echo ""
      echo "── redis ──"
      echo "  redis-cli ping         check local redis"
      echo ""
      echo "── deploy ──"
      echo "  install -m 644 site.nix /etc/nixos/          # add to imports"
      echo "  see README.md for full deployment guide"
    '';
  }
