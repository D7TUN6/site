{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  # NOTE: suffix changed to force a new derivation path if an old .drv in /nix/store is corrupted.
  name = "d7tun6-site-vite-shell-v2";

  buildInputs = with pkgs; [
    nodejs_22
    nodePackages.npm
    nodePackages.pnpm
    git
    jq
    curl
    cacert
    openssl
    pkg-config
    ffmpeg
  ];

  shellHook = ''
    echo "Dev shell ready for d7tun6.site"
    echo "Run: npm install && npm run dev"
  '';
}
