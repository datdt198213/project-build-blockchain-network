const crypto = require("crypto"); SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec; ec = new EC("secp256k1");

const keyPair = ec.genKeyPair();

// public key: keyPair.getPublic("hex")
// private key: keyPair.getPrivate("hex")

const MIN_PRIVATE_ADDRESS = "d31a9c283032ce5c980eb84daca3b706bf96b44693e1efb8450ab2e219e2168e"
const MINT_KEY_PAIR = ec.keyFromPrivate(MIN_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

// const holderKeyPair = ec.genKeyPair()
// console.log(holderKeyPair.getPrivate("hex"))

class Block {
    constructor(timestamp = "", data= []){
        this.timestamp = timestamp;
        this.data = data;
        this.hash = Block.getHash(this);
        this.prevHash = "";
        this.nonce = 0;
    }

    static getHash(block) {
        return SHA256(block.prevHash + block.timestamp + JSON.stringify(block.data) + block.nonce)
    }

    mine(difficulty) {
        while(!this.hash.startsWith(Array(difficulty + 1).join("0"))) {
            this.nonce++;
            this.hash = Block.getHash(this);
        }
    }

    static hasValidTransaction(block, chain) {
        let gas = 0, reward = 0;

        block.data.forEach(transaction => {
            // Tại sao lại check địa chỉ gửi khác địa chỉ MINT
            if (transaction.from !== MINT_PUBLIC_ADDRESS) {
                gas += transaction.gas;
            } else {
                reward = transaction.amount;
            }
        })

        return (
            reward - gas === chain.reward && 
            block.data.every(transaction => Transaction.isValid(transaction, chain)) &&
            block.data.filter(transaction => transaction.from === MINT_PUBLIC_ADDRESS).length === 1
        ) 
    }
}

class Blockchain {
    constructor() {
        const initialCoinRelease = new Transaction(MINT_PUBLIC_ADDRESS, "048b8937d440387bd32078cb549672c93eda1b0c552914618e44275017ac95c05a7c3190edce7793b58e3cf8a092c02066f90f04c6ef43aa7c7d522ebd102f812b", 100000);
        this.chain = [new Block("", [initialCoinRelease])];
        this.difficulty = 1;
        this.blockTime = 30000;
        this.transactions = [];
        this.reward = 209;
    }

    getLastBlock() {
        return this.chain[this.chain.length - 1];
    }
    
    getBalance(address) {
        let balance = 0;
        
        this.chain.forEach(block => {
            block.data.forEach(transaction => {
                if(transaction.from === address) {
                    balance -= transaction.amount;
                    balance -= transaction.gas;
                }

                if(transaction.to === address) {
                    balance += transaction.amount;
                }
            })
        })
        return balance;
    }

    addBlock(block) {
        block.prevHash = this.getLastBlock().hash;
        block.hash = Block.getHash(block);

        block.mine(this.difficulty);
        this.chain.push(block);

        this.difficulty += Date.now() - parseInt(this.getLastBlock().timestamp) < this.blockTime ? 1: -1;
    }

    addTransaction(transaction) {
        // console.log("DEBUG Transaction.addTransaction", Transaction.isValid(transaction, this))
        if(Transaction.isValid(transaction, this)) 
            this.transactions.push(transaction)
    }

    mineTransaction(rewardAddress) {
        let gas = 0;

        this.transactions.forEach(transaction => {
            gas += transaction.gas;
        })

        const rewardTransaction = new Transaction(MINT_PUBLIC_ADDRESS, rewardAddress, this.reward + gas);
        rewardTransaction.sign(MINT_KEY_PAIR);

        if(this.transactions.length !== 0)
            this.addBlock(new Block(Date.now().toString(), [new Transaction(MINT_PUBLIC_ADDRESS, rewardAddress, this.reward), ...this.transactions]));
        this.transactions = [];
    }

    static isValid(blockchain) {
        for (let i = 1; i < blockchain.chain.length; i++) {
            const currentBlock = blockchain.chain[-1];
            const prevBlock = blockchain.chain[i-1]

            if (currentBlock.hash !== Block.getHash(currentBlock) || 
            prevBlock.hash !== currentBlock.prevHash || 
            !Block.hasValidTransaction(currentBlock, blockchain)
            ) {
                return false
            }
        }
        return true;
    }
}

class Transaction {
    constructor(from, to, amount, gas) {
        this.from = from;
        this.to = to;
        this.amount = amount;
        this.gas = gas
    }

    sign(keyPair) {
        if(keyPair.getPublic("hex") === this.from) {
            this.signature = keyPair.sign(SHA256(this.from + this.to + this.amount + this.gas), "base64").toDER("hex");
        }
        // console.log("DEBUG Transaction.sign()",  this.signature = keyPair.sign(SHA256(this.from + this.to + this.amount + this.gas), "base64").toDER("hex"))
    }

    static isValid(transaction, chain) {
        // console.log("DEBUG isValid() ",chain.getBalance(transaction.from))
        return (transaction.from && 
            transaction.to && 
            transaction.amount && 
            (chain.getBalance(transaction.from) >= transaction.amount + transaction.gas || transaction.from === MINT_PUBLIC_ADDRESS) && 
            ec.keyFromPublic(transaction.from, "hex").verify(SHA256(transaction.from + transaction.to+ transaction.amount +transaction.gas), transaction.signature))
    }
}



// console.log(MINT_KEY_PAIR.getPrivate())
// console.log(MINT_KEY_PAIR.getPublic())

// const aWallet = ec.genKeyPair();

// const transaction = new Transaction(holderKeyPair.getPublic("hex"), aWallet.getPublic("hex"), 333, 10);
// transaction.sign(holderKeyPair);

// chain.addTransaction(transaction);
// chain.mineTransaction(aWallet.getPublic("hex"));

// console.log("So du cua ban: ", chain.getBalance(holderKeyPair.getPublic("hex")));

// console.log("So du cua ban gui", chain.getBalance(aWallet.getPublic("hex")))
const DatChain = new Blockchain()
module.exports = {Block, Blockchain, Transaction, DatChain}