/**
 * Deploy $RFLAG Token
 *
 * Testnet:  npx hardhat run scripts/deploy-rflag-hardhat.cjs --network amoy
 * Mainnet:  npx hardhat run scripts/deploy-rflag-hardhat.cjs --network polygon
 *
 * After deploy, copy the address into src/services/rflagToken.js
 */

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying $RFLAG with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "MATIC");

  if (balance === 0n) {
    console.error("\n❌ No MATIC balance!");
    console.error("Get free testnet MATIC at: https://faucet.polygon.technology");
    process.exit(1);
  }

  console.log("\nDeploying RFLAGToken...");
  const Token = await hre.ethers.getContractFactory("RFLAGToken");
  const token = await Token.deploy();
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("\n✅ $RFLAG deployed to:", address);
  console.log("Network:", hre.network.name);

  // Verify token info
  const name = await token.name();
  const symbol = await token.symbol();
  const supply = await token.totalSupply();
  console.log(`\nToken: ${name} (${symbol})`);
  console.log(`Total supply: ${hre.ethers.formatEther(supply)} RFLAG`);

  const isTestnet = hre.network.name === "amoy";
  const explorerUrl = isTestnet
    ? `https://amoy.polygonscan.com/address/${address}`
    : `https://polygonscan.com/address/${address}`;

  console.log(`\nExplorer: ${explorerUrl}`);
  console.log("\n📋 NEXT STEPS:");
  console.log(`1. Copy this address: ${address}`);
  console.log("2. Open: src/services/rflagToken.js");
  if (isTestnet) {
    console.log(`3. Set: RFLAG_CONTRACT_AMOY = '${address}'`);
  } else {
    console.log(`3. Set: RFLAG_CONTRACT_POLYGON = '${address}'`);
  }
  console.log("4. Rebuild and redeploy the app");

  if (process.env.POLYGONSCAN_API_KEY) {
    console.log("\nVerifying on Polygonscan...");
    await hre.run("verify:verify", {
      address,
      constructorArguments: [],
    });
    console.log("✅ Contract verified!");
  } else {
    console.log("\nTo verify on Polygonscan:");
    console.log(`npx hardhat verify --network ${hre.network.name} ${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
