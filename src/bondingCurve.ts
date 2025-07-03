import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { BondingCurve, Global } from "./state";

function getFee(
  global: Global,
  amount: BN,
  isBuy: boolean,
): BN {
  return computeFee(amount, isBuy ? global.platformBuyFee : global.platformSellFee)
}

function computeFee(amount: BN, feeBasisPoints: BN): BN {
  return ceilDiv(amount.mul(feeBasisPoints), new BN(10_000));
}

function ceilDiv(a: BN, b: BN): BN {
  return a.add(b.subn(1)).div(b);
}

export function newBondingCurve(global: Global): BondingCurve {
  return {
    virtualTokenReserves: global.tokenSupplyConifg,
    virtualSolReserves: global.lamportAmountConfig,
    realTokenReserves: global.tokenSupplyConifg,
    realSolReserves: new BN(0),
    tokenTotalSupply: global.tokenSupplyConifg,
    complete: false,
    creator: PublicKey.default,
  };
}

export function getBuyTokenAmountFromSolAmount(
  global: Global,
  bondingCurve: BondingCurve | null,
  amount: BN,
): BN {
  if (amount.eq(new BN(0))) {
    return new BN(0);
  }

  let isNewBondingCurve = false;

  if (bondingCurve === null) {
    bondingCurve = newBondingCurve(global);
    isNewBondingCurve = true;
  }

  // migrated bonding curve
  if (bondingCurve.reserveToken.eq(new BN(0))) {
    return new BN(0);
  }

  const totalFeeBasisPoints = global.platformBuyFee

  const inputAmount = amount.muln(10_000).div(totalFeeBasisPoints.addn(10_000));

  const tokensReceived = inputAmount
    .mul(bondingCurve.reserveToken)
    .div(bondingCurve.reserveLamport.add(inputAmount));

  return BN.min(tokensReceived, bondingCurve.reserveToken);
}

export function getBuySolAmountFromTokenAmount(
  global: Global,
  bondingCurve: BondingCurve | null,
  amount: BN,
): BN {
  if (amount.eq(new BN(0))) {
    return new BN(0);
  }

  if (bondingCurve === null) {
    bondingCurve = newBondingCurve(global);
  }

  // migrated bonding curve
  if (bondingCurve.virtualTokenReserves.eq(new BN(0))) {
    return new BN(0);
  }

  const minAmount = BN.min(amount, bondingCurve.realTokenReserves);

  const solCost = minAmount
    .mul(bondingCurve.virtualSolReserves)
    .div(bondingCurve.virtualTokenReserves.sub(minAmount))
    .add(new BN(1));

  return solCost.add(getFee(global, solCost, true));
}

export function getSellSolAmountFromTokenAmount(
  global: Global,
  bondingCurve: BondingCurve,
  amount: BN,
): BN {
  if (amount.eq(new BN(0))) {
    return new BN(0);
  }

  // migrated bonding curve
  if (bondingCurve.virtualTokenReserves.eq(new BN(0))) {
    return new BN(0);
  }

  const solCost = amount
    .mul(bondingCurve.virtualSolReserves)
    .div(bondingCurve.virtualTokenReserves.add(amount));

  return solCost.sub(getFee(global, solCost, false));
}
