{pkgs ? import <nixpkgs> {}}:
pkgs.mkShell {
  name = "d7tun6-site-shell";

  buildInputs = with pkgs; [
    nodejs_24
    # nodePackages.npm
    # nodePackages.pnpm
    git
    jq
    curl
    cacert
    openssl
    postfix
    pkg-config
    ffmpeg
    minio
    minio-client
    swaks
    woff2
  ];

  shellHook = ''
    echo "dev shell ready for d7tun6.site"
    echo "npm install && npm run dev"
  '';
}
