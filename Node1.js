const crypto = require("crypto"); SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec; ec = new EC("secp256k1");

const {Block, Blockchain, Transaction, DatChain} = require('./Blockchain');

const MIN_PRIVATE_ADDRESS = "d31a9c283032ce5c980eb84daca3b706bf96b44693e1efb8450ab2e219e2168e"
const MINT_KEY_PAIR = ec.keyFromPrivate(MIN_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

const privateKey = "1fd804202758c32835b33f792873f56fca9556993853a32437dcd877eef44de0";
const keyPair = ec.keyFromPrivate(privateKey, "hex");
const publicKey = keyPair.getPublic("hex");
// 048b8937d440387bd32078cb549672c93eda1b0c552914618e44275017ac95c05a7c3190edce7793b58e3cf8a092c02066f90f04c6ef43aa7c7d522ebd102f812b

const WS = require("ws");

const PORT = process.env.PORT || 3003;
const MY_ADDRESS = process.env.MY_ADDRESS || "ws://localhost:3003";
const PEERS = process.env.PEERS ? process.env.PEERS.split(","): ["ws://localhost:3004", "ws://localhost:3005"];

const server = new WS.Server({port: PORT});
console.log("Listen on PORT", PORT);


let opened = []     // Store socket & address
let connected = []  // Store address
let check = [];     // Lưu các kết quả gửi về
let checked = [];     // Lưu các kết quả mà đã thỏa mãn điều kiện
let checking = false;  // Checking: true đang trong quy trình kiểm tra (yêu cầu các node khác gửi block mới nhất của node đó, chờ trong 1 lúc(timeslot)) checking: false, hủy quy trình kiểm tra (Nếu block nào xuất hiện nhiều nhất thì có khả năng cao nhất là block chuẩn) kiểm tra prevHash của block hiện tại có là hash của block mới nhất trong chuỗi hay không. Tạo hệ thống skip qua các node khi đã có block đúng
let tempChain = new Blockchain()

process.on("uncaughtException", err => console.log(err));

server.on("connection", async (socket, req) => {
    socket.on("message", message => {
        const _message = JSON.parse(message);

        switch(_message.type) {
            case "TYPE_HANDSHAKE":
                const nodes = _message.data;
                // console.log(nodes)
                nodes.forEach(node => connect(node));
                break;
            
            case "TYPE_CREATE_TRANSACTION":
                // Tạo transaction
                // { 
                //     'type': "TYPE_CREATE_TRANSACTION",
                //     "data": "OBJECT TRANSACTION"
                // }

                const transaction = _message.data;
                DatChain.addTransaction(transaction);
                break;

            case "TYPE_REPLACE_CHAIN":
                // Đào và tạo block mới 
                // {
                //     "type": "TYPE_REPLACE_CHAIN",
                //     "data": [
                //         "block moi",
                //         "difficulty moi"
                //     ]
                // }    
                // Xác thực block => cho block vào chain
                // Tiêu chí xác thực block: giao dịch hợp lệ (tồn tại trong pool) & được check qua isValid() & có hash hợp lệ, & match với những thông tin của block, difficulty hợp lệ (không thể hơn hoặc kém hơn so với difficulty trước) thời gian hợp lệ (Không thẻ lớn hơn mốc thời gian block tồn tại, không thể bé hơn mốc thời gian mà block trước được khởi tạo)


                const [newBlock, newDiff] = _message.data;

                // Tạo bản sao pool hiện tại
                const ourTx = [...DatChain.transactions.map(transaction => JSON.stringify(transaction))];
                // Tạo bản sao chứa các transactions trong block mới
                // Các giao dịch này không bao gồm giao dịch reward (transaction.from !== MINT_PUBLIC_ADDRESS)
                const theirTx = [...newBlock.data.filter(transaction => transaction.from !== MINT_PUBLIC_ADDRESS).map(transaction => JSON.stringify(transaction))]; // Map trả về kết quả của hàm callback bên trong, filter lọc kết quả theo điều kiện
                const n = theirTx.length; // Độ dài của array

                // check hash của block mới có là hash của block hiện tại không
                if (newBlock.prevHash !== DatChain.getLastBlock().prevHash) {
                    for (let i = 0; i < n; i++) {
                        // Tìm vị trí của phần tử đầu tiên của theirTx trong ourTx
                        const index = ourTx.indexOf(theirTx[0]);

                        // Nếu không tồn tại trong pool, thoát khỏi loop
                        if (index === -1) break;

                        ourTx.splice(index, 1);
                        theirTx.splice(0, 1);
                    }

                    if (theirTx.length === 0 &&
                        SHA256(DatChain.getLastBlock().hash + newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.nonce) === newBlock.hash && newBlock.hash.startsWith(Array(DatChain.difficulty + 1).join("0")) &&
                        Block.hasValidTransaction(newBlock, DatChain) &&
                        (parseInt(newBlock.timestamp) > parseInt(DatChain.getLastBlock().timestamp === "")) &&
                        parseInt(newBlock.timestamp < Date.now()) &&
                        DatChain.getLastBlock().hash === newBlock.prevHash &&
                        (newDiff + 1 === DatChain.difficulty || newDiff - 1 === DatChain.difficulty)
                        ) {
                            DatChain.chain.push(newBlock);
                            DatChain.difficulty = newDiff;
                            DatChain.transactions = [...ourTx.map(tx => JSON.parse(tx))];
                        }
                    break;
                } else if (!checked.includes(JSON.stringify([newBlock.prevHash, DatChain.chain[DatChain.chain.length - 2].timestamp]))) {
                    check.push(JSON.stringify(DatChain.getLastBlock().prevHash, DatChain.chain[DatChain.chain.length - 2].timestamp));

                    const position = DatChain.chain.length - 1;
                    checking = true;

                    sendMessage(produceMessage("TYPE_REQUEST_CHECK", MY_ADDRESS));

                    setTimeout(() => {
                        checking = false;

                        let mostAppeared = check[0];
                        
                        // Group: [block, difficulty, transaction pool]
                        check.forEach(group => {
                            if (check.filter(_group => _group === group).length > check.filter(_group => _group === mostAppeared).length) {
                                mostAppeared = group;
                            }
                        })

                        const group = JSON.parse(mostAppeared);
                        
                        DatChain.chain[position] = group[0];
                        DatChain.transactions = [...group[1]];
                        DatChain.difficulty = group[2];

                        check.splice(0, check.length);
                    }, 5000)
                }
            
                case "TYPE_REQUEST_CHECK":
                    // {
                    //      "type": "TYPE_REQUEST_CHECK",
                    //      "data": Địa chỉ
                    // }
                    opened.filter(node => node.address === _message.data)[0].socket.send(
                        JSON.stringify(produceMessage(
                            "TYPE_SEND_CHECK",
                            JSON.stringify([DatChain.getLastBlock(), DatChain.transactions, DatChain.difficulty])
                        ))
                    );

                case "TYPE_SEND_CHECK":
                    // {
                    //     "type": "TYPE_SEND_CHECK",
                    //     "data": ["Block", "Transaction pool", "difficulty"]
                    // }
                    // Chỉ push nếu ta đang mở yêu cầu check
                    if(checking) check.push(_message.data);
                    break;
                
                case "TYPE_REQUEST_CHAIN":    // 1 node gửi cho mình, mình phản hồi
                    // {
                    //      "type": "TYPE_REQUEST_CHECK",
                    //      "data": Địa chỉ
                    // }
                    const socket = opened.filter(node => node.address === _message.data)[0].socket;

                    for (let i = 1; i < DatChain.chain.length; i++) {
                        // Gửi liên tục các block cho một node cho đến khi finish
                        socket.send(JSON.stringify(produceMessage("TYPE_SEND_CHAIN",
                        {
                            block: DatChain.chain[i],
                            finished:i === DatChain.chain.length - 1
                        })));
                    }
                    break;

                case "TYPE_SENT_CHAIN":       // Gửi các Block
                    const {block, finished} = _message.data;

                    if (!finished) {
                        tempChain.chain.push(block);
                    } else {
                        if (Blockchain.isValid(tempChain)) {
                            DatChain.chain = tempChain.chain;
                        }
                        tempChain = new Blockchain(); // Gán lại tempChain thành rỗng
                    }
                    break;

                case "TYPE_REQUEST_INFO":     // Yêu cầu thông tin như Transaction pool, Difficulty
                    opened.filter(node => node.address === _message.data)[0].socket.send(JSON.stringify(produceMessage(
                        "TYPE_SEND_INFO",
                        [DatChain.difficulty, DatChain.transactions]
                    )));
                    break;

                case "TYPE_SENT_INFO":        // Xem lại thông tin cần
                [DatChain.difficulty, DatChain.transactions] = _message.data
                    break;
        }
    })
});

async function connect(address) {

    if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
        const socket = new WS(address);
        socket.on("open", () => {
            // Gửi cho các node khác địa chỉ mà node hiện tại đã kết nối
            // spread operator để cho tất cả các địa chỉ của các node đã kết nối vào nội dung của tin nhắn rồi gửi nó đi
            socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [MY_ADDRESS, ...connected])));

                    // Gửi địa chỉ của các node đã kết nối với node hiện tại để các node khác có thể cùng kết nối
            opened.forEach(node => node.socket.send(JSON.stringify(produceMessage("TYPE_HANDSAKE", [address]))));

            // Chúng ta sẽ push vào "opened" nếu chúng ta chưa từng kết nối với nó
            if (!opened.find(peer => peer.address === address) && address !== MY_ADDRESS) {
                opened.push({socket, address});
            }

            // Chúng ta sẽ push vào "connected" nếu chúng ta chưa từng kết nối với nó
            if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
                connected.push(address);
            }
                
            // Hai lệnh if trên dùng để khắc phục code chạy bất đồng bộ. Vì chúng chạy đồng thời, nên lệnh if đầu tiên
            // có thể bị vượt qua một cách dễ dàng, từ đó sinh ra sự lặp lại không đáng có.
        })

        socket.on("close", () => {
            opened.splice(connected.indexOf(address), 1)
            connected.splice(connected.indexOf(address), 1)
        })
    }
}

function produceMessage(type, data) {
    return {type, data}
}

function sendMessage(message) {
    opened.forEach(node => {
        node.socket.send(JSON.stringify(message))
    })
}

PEERS.forEach(peer => connect(peer));

// Cách gửi transaction
// sendMessage(produceMessage("TYPE_CREARTE_TRANSACTION", transaction));
// DatChain.addTransaction(transaction)

setTimeout( () => {
    const transaction = new Transaction(publicKey, "04bf4187b0854e2317cbfd31b9a3c2503448284f154be98db61479c07af46e7a33be8504c0cc1b58b1ca2f2195a3a36e4184b93af00381dd74b7446fba85cea77e", 200, 10)

    transaction.sign(keyPair);

    sendMessage(produceMessage("TYPE_CREATE_TRANSACTION", transaction));
    DatChain.addTransaction(transaction);
}, 5000);


setTimeout(() => {
    console.log(opened)
    // sendMessage(produceMessage("TYPE_REQUEST_CHECK", PEERS[1]));
    console.log(DatChain)
}, 15000)

setTimeout(() => {
    const transaction = new Transaction(publicKey, "04bf4187b0854e2317cbfd31b9a3c2503448284f154be98db61479c07af46e7a33be8504c0cc1b58b1ca2f2195a3a36e4184b93af00381dd74b7446fba85cea77e", 200, 10)

    transaction.sign(keyPair);

    sendMessage(produceMessage("TYPE_CREATE_TRANSACTION", transaction));
    DatChain.addTransaction(transaction);
}, 30000)
