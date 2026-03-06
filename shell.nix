{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "d7tun6-site-vue-shell-v3";

  buildInputs = with pkgs; [
    nodejs_24
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
