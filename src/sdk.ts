import { AnchorProvider, Program } from "@coral-xyz/anchor";
import {
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddressSync,
    NATIVE_MINT,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
    AccountInfo,
    Connection,
    PublicKey,
    PublicKeyInitData,
    TransactionInstruction,
} from "@solana/web3.js";
import dumpIdl from "./idl/dumpdotfun.json";
import { Dumpdotfun } from "./idl/dumpdotfun";
import BN from "bn.js";

import {
    bondingCurvePda,
    dumpPoolAuthorityPda,
    globalPda,
} from "./pda";
import { BondingCurve, Global } from "./state";
import { getBuyTokenAmountFromSolAmount } from "./bondingCurve";

export function getDumpProgram(
    connection: Connection,
    programId: PublicKey,
): Program<Dumpdotfun> {
    const pumpIdlAddressOverride = { ...dumpIdl };

    pumpIdlAddressOverride.address = programId.toString();

    return new Program(
        pumpIdlAddressOverride as Dumpdotfun,
        new AnchorProvider(connection, null as any, {}),
    );
}

export const DUMP_PROGRAM_ID = new PublicKey(
    "BGPsmYozwhbbamFixASxZkJjxgb4P3nZRfAYy2Ef5P3c",
);

export const BONDING_CURVE_NEW_SIZE = 150;

export class DumpSdk {
    private readonly connection: Connection;
    private readonly dumpProgram: Program<Dumpdotfun>;

    constructor(
        connection: Connection,
        dumpProgramId: PublicKey = DUMP_PROGRAM_ID,
    ) {
        this.connection = connection;
        this.dumpProgram = getDumpProgram(connection, dumpProgramId);
    }

    programId(): PublicKey {
        return this.dumpProgram.programId;
    }

    globalPda() {
        return globalPda(this.dumpProgram.programId);
    }

    bondingCurvePda(mint: PublicKeyInitData): PublicKey {
        return bondingCurvePda(this.dumpProgram.programId, mint);
    }

    dumpPoolAuthorityPda(mint: PublicKey): [PublicKey, number] {
        return dumpPoolAuthorityPda(mint, this.dumpProgram.programId);
    }

    decodeGlobal(accountInfo: AccountInfo<Buffer>): Global {
        return this.dumpProgram.coder.accounts.decode<Global>(
            "global",
            accountInfo.data,
        );
    }

    decodeBondingCurve(accountInfo: AccountInfo<Buffer>): BondingCurve {
        return this.dumpProgram.coder.accounts.decode<BondingCurve>(
            "bondingCurve",
            accountInfo.data,
        );
    }

    async fetchGlobal(): Promise<Global> {
        return await this.dumpProgram.account.config.fetch(this.globalPda());
    }

    async fetchBondingCurve(mint: PublicKeyInitData): Promise<BondingCurve> {
        return await this.dumpProgram.account.bondingCurve.fetch(
            this.bondingCurvePda(mint),
        );
    }

    async fetchBuyState(mint: PublicKey, user: PublicKey) {
        const [bondingCurveAccountInfo] =
            await this.connection.getMultipleAccountsInfo([
                this.bondingCurvePda(mint),
                getAssociatedTokenAddressSync(mint, user, true),
            ]);

        if (!bondingCurveAccountInfo) {
            throw new Error(
                `Bonding curve account not found for mint: ${mint.toBase58()}`,
            );
        }

        const bondingCurve = this.decodeBondingCurve(bondingCurveAccountInfo);
        return { bondingCurve };
    }

    async fetchSellState(mint: PublicKey, user: PublicKey) {
        const [bondingCurveAccountInfo] =
            await this.connection.getMultipleAccountsInfo([
                this.bondingCurvePda(mint),
                getAssociatedTokenAddressSync(mint, user, true),
            ]);

        if (!bondingCurveAccountInfo) {
            throw new Error(
                `Bonding curve account not found for mint: ${mint.toBase58()}`,
            );
        }

        const bondingCurve = this.decodeBondingCurve(bondingCurveAccountInfo);
        return { bondingCurve };
    }

    async fetchAssociatedUserAccountInfo(mint: PublicKey, user: PublicKey) {
        return getAssociatedTokenAddressSync(mint, user, true);
    }

    async createInstruction({
        mint,
        name,
        symbol,
        uri,
        creator,
    }: {
        mint: PublicKey;
        name: string;
        symbol: string;
        uri: string;
        creator: PublicKey;
    }): Promise<TransactionInstruction> {
        return await this.dumpProgram.methods
            .launch(
                name,
                symbol,
                uri,
            )
            .accounts({
                creator,
                token: mint,
            })
            .instruction();
    }

    async buyInstructions({
        global,
        bondingCurve,
        associatedUserAccountInfo,
        mint,
        user,
        amount,
        slippage,
    }: {
        global: Global;
        bondingCurve: BondingCurve;
        associatedUserAccountInfo: AccountInfo<Buffer> | null;
        mint: PublicKey;
        user: PublicKey;
        amount: BN;
        slippage: number;
    }): Promise<TransactionInstruction[]> {
        const instructions: TransactionInstruction[] = [];

        const associatedUser = await this.fetchAssociatedUserAccountInfo(mint, user);

        if (!associatedUserAccountInfo) {
            instructions.push(
                createAssociatedTokenAccountIdempotentInstruction(
                    user,
                    associatedUser,
                    user,
                    mint,
                ),
            );
        }

        instructions.push(
            await this.buyInstruction({
                global,
                mint,
                user,
                amount,
                slippage,
                bondingCurve,
            }),
        );

        return instructions;
    }

    async createAndBuyInstructions({
        global,
        mint,
        name,
        symbol,
        uri,
        creator,
        user,
        amount,
    }: {
        global: Global;
        mint: PublicKey;
        name: string;
        symbol: string;
        uri: string;
        creator: PublicKey;
        user: PublicKey;
        amount: BN;
    }): Promise<TransactionInstruction[]> {
        const bondingCurve = await this.fetchBondingCurve(mint);
        const associatedUser = await this.fetchAssociatedUserAccountInfo(mint, user);

        return [
            await this.createInstruction({ mint, name, symbol, uri, creator }),
            
            createAssociatedTokenAccountIdempotentInstruction(
                user,
                associatedUser,
                user,
                mint,
            ),
            await this.buyInstruction({
                global,
                mint,
                user,
                amount,
                slippage: 1,
                bondingCurve,
            }),
        ];
    }

    private async buyInstruction({
        global,
        mint,
        user,
        amount,
        slippage,
        bondingCurve,
    }: {
        global: Global;
        mint: PublicKey;
        user: PublicKey;
        amount: BN;
        slippage: number;
        bondingCurve: BondingCurve;
    }) {
        const amountOut = getBuyTokenAmountFromSolAmount(global, bondingCurve, amount);
        return await this.dumpProgram.methods
            .swap(
                amount,
                0,
                amountOut.sub(
                    amountOut.mul(new BN(Math.floor(slippage * 10))).div(new BN(1000)),
                )
            )
            .accounts({
                teamWallet: global.teamWallet,
                user,
                tokenMint: mint,
            })
            .instruction();
    }

    async sellInstructions({
        global,
        mint,
        user,
        amount,
        solAmount,
        slippage,
    }: {
        global: Global;
        mint: PublicKey;
        user: PublicKey;
        amount: BN;
        solAmount: BN;
        slippage: number;
    }): Promise<TransactionInstruction[]> {
        const instructions: TransactionInstruction[] = [];

        instructions.push(
            await this.dumpProgram.methods
                .swap(
                    amount,
                    1,
                    solAmount.sub(
                        solAmount.mul(new BN(Math.floor(slippage * 10))).div(new BN(1000)),
                    ),
                )
                .accounts({
                    teamWallet: global.teamWallet,
                    user,
                    tokenMint: mint,
                })
                .instruction(),
        );

        return instructions;
    }

    async migrateInstructions({
        global,
        mint,
    }: {
        global: Global;
        mint: PublicKey;
    }): Promise<TransactionInstruction[]> {
        const instructions: TransactionInstruction[] = [];

        const teamAta = await this.fetchAssociatedUserAccountInfo(mint, global.teamWallet);
        const index = 1;
        const indexBN = new BN(index)
        const globalVault = PublicKey.findProgramAddressSync(
            [Buffer.from("global")],
            this.dumpProgram.programId
        )[0];
        
        const pumpswapProgram = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA")

        const pool = PublicKey.findProgramAddressSync(
            [
                Buffer.from("pool"),
                indexBN.toArrayLike(Buffer, "le", 2),
                globalVault.toBytes(),
                mint.toBytes(),
                NATIVE_MINT.toBytes()
            ],
            pumpswapProgram
        )[0];

        const poolBaseTokenAccountPDA = getAssociatedTokenAddressSync(
            mint,
            pool,
            true
        );

        const poolQuoteTokenAccountPDA = getAssociatedTokenAddressSync(
            NATIVE_MINT,
            pool,
            true
        );
        instructions.push(createAssociatedTokenAccountIdempotentInstruction(
            global.teamWallet,
            teamAta,
            global.teamWallet,
            mint
        ))

        instructions.push(
            await this.transferFeeInstruction({
                global,
                mint
            }),
        );
        instructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                global.teamWallet,
                poolBaseTokenAccountPDA,
                global.teamWallet,
                mint
            ),
            createAssociatedTokenAccountIdempotentInstruction(
                global.teamWallet,
                poolQuoteTokenAccountPDA,
                global.teamWallet,
                NATIVE_MINT
            ),
        )
        instructions.push(
            await this.migratePumpswapInstruction({
                global,
                mint
            }),
        );
        return instructions;
    }

    private async transferFeeInstruction({
        global,
        mint,
    }: {
        global: Global;
        mint: PublicKey;
    }): Promise<TransactionInstruction> {

        return this.dumpProgram.methods
            .transferFee()
            .accounts({
                coinMint: mint,
                payer: global.teamWallet,
                teamWallet: global.teamWallet,
            })
            .instruction();
    }

    private async migratePumpswapInstruction({
        global,
        mint,
    }: {
        global: Global;
        mint: PublicKey;
    }): Promise<TransactionInstruction> {

        const pumpswapProgram = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA")

        const index = 1;
        return this.dumpProgram.methods
            .migratePumpswap(
                index
            )
            .accounts({
                teamWallet: global.teamWallet,
                coinMint: mint,
                payer: global.teamWallet,
                wsolMint: NATIVE_MINT,
                pumpswapProgram,
            })
            .instruction();
    }
}
