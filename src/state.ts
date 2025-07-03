import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export interface Global {
    authority: PublicKey;
    pendingAuthority: PublicKey;
    teamWallet: PublicKey;
    initBondingCurve: BN;

    platformBuyFee: BN;
    platformSellFee: BN;
    platformMigrationFee: BN;
    curveLimit: BN;

    sellTimestampLimit: BN;
    sellCurveLimit: BN;
    lamportAmountConfig: BN;
    tokenSupplyConfig: BN;
    tokenDecimalsConfig: BN;
}

export interface BondingCurve {
    tokenMint: PublicKey;
    creator: PublicKey;
    createdTime: BN;
    initLamport: BN;
    reserveLamport: BN;
    reserveToken: BN;
    isCompleted: boolean;
  }