{
  inputs = {
    nixpkgs.url = "nixpkgs";
    # nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    { nixpkgs, flake-parts, ... }@inputs:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = nixpkgs.lib.systems.flakeExposed;
      perSystem =
        { pkgs, ... }:
        {
          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs

              # Alternatively, you can use a specific major version of Node.js
              # nodejs-22_x

              # Use corepack to install npm/pnpm/yarn as specified in package.json
              # corepack

              # To install a specific alternative package manager directly,
              # comment out one of these to use an alternative package manager.
              yarn
              # pnpm
              # bun

              # Required to enable the language server
              nodePackages.typescript
              nodePackages.typescript-language-server

              # vue-language-server

              # Python is required on NixOS if the dependencies require node-gyp
              # python3
            ];
          };
        };
    };
}
