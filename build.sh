home() {
    cd "$(git rev-parse --show-toplevel)" || exit 1
}

home

if [[ $(uname -m) == "arm64" ]]; then
    echo "Running on Apple Silicon"
    rustup override set 1.75.0-x86_64-apple-darwin
else
    echo "Not running on Apple Silicon"
    rustup override set 1.75.0
fi

agave-install init 1.18.8
solana-install init 1.18.8

cargo build || exit 1

cargo fmt || exit 1

anchor build || exit 1

pnpm i || exit 1

pnpm idl || exit 1

cd ts/sdk || exit 1

pnpm i || exit 1

pnpm build || exit 1

home || exit 1

pnpm lint || exit 1

