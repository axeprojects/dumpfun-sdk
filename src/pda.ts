import { PublicKey, PublicKeyInitData } from "@solana/web3.js";

export function globalPda(programId: PublicKey): PublicKey {
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  );
  return globalPda;
}

export function bondingCurvePda(
  programId: PublicKey,
  mint: PublicKeyInitData,
): PublicKey {
  const [bondingCurvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), new PublicKey(mint).toBuffer()],
    programId,
  );
  return bondingCurvePda;
}

export function dumpPoolAuthorityPda(
  mint: PublicKey,
  dumpProgramId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool-authority"), mint.toBuffer()],
    dumpProgramId,
  );
}

export const CANONICAL_POOL_INDEX = 0;

