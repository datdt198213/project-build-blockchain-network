const crypto = require('crypto')
SHA256 = message => crypto.createHash("sha256").update(message).digest("hex")
const EC = require('elliptic').ec;
const ec = new EC("secp256k1");
const WS = require('ws');


const {Blockchain, Block, Transaction, DatChain} = require("./Blockchain")

const MINT_PRIVATE_ADDRESS = "d31a9c283032ce5c980eb84daca3b706bf96b44693e1efb8450ab2e219e2168e";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic('hex');

// const keyPair = ec.genKeyPair("hex");
const privateKey = "a9210866114d328cc18b0531d950dbb782bdfd6d4ca751b8d369069d156e94d3"
const keyPair = ec.keyFromPrivate(privateKey, "hex");
const publicKey = keyPair.getPublic("hex");
// 04bf6309d89584f374906c0df4a086298d9f7f91b83ed424d9b20c999ef1c5b70c8ccb80d2615ece3687fbed8c16eb6af6cef0a0f843d776aa1af4d33cacc04ed5


const PORT = process.env.PORT || 3006;
const MY_ADDRESS = process.env.MY_ADDRESS || "ws://localhost:3006";
const PEERS = process.env.PEER ? process.env.PEERS.split(','): ["ws://localhost:3003", "ws://localhost:3004", "ws://localhost:3005"]

const server = new WS.Server({port:PORT});
console.log("Listening on PORT ", PORT);

const opened = []
const connected = []

server.on("connection", async (socket, req) => {
    socket.on("message", message => {
        const _message = JSON.parse(message);

        switch(_message) {
            case "TYPE_HANDSHAKE":
                const nodeAddresses = _message.data;

                nodeAddresses.forEach(nodeAddress => connect(nodeAddress));
                break;

        }
    })
})

function produceMessage(type, data) {
    return {type, data}
}

async function connect(address) {
    try {
        if (!connected.find(nodeAddress => nodeAddress === address) && address !== MY_ADDRESS) {
            const socket = new WS(address);
            socket.on("open", () => {
                socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [MY_ADDRESS, ...connected])))
    
                opened.forEach(node => node.socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [address]))));
    
                if(!opened.find(peer => peer.address === address) && address !== MY_ADDRESS) {
                    opened.push({socket, address});
                }
    
                if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
                    connected.push(address);
                }
            }) 
    
            socket.on("close", () => {
                opened.splice(connected.indexOf(address), 1);
                connected.splice(connected.indexOf(address), 1);
            })
        }
    } catch(error) {
        console.error("Error while connecting:", error);
    }
}

PEERS.forEach(peer => connect(peer))