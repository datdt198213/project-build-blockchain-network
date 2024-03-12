// Import package
const WS = require("ws");
// Khởi tạo một server
const server = new WS.Server({ port: "SOME PORT" });
// Nghe tín hiệu kết nối
server.on("connection", async (socket, req) => {
    // Event handler này sẽ được chạy mỗi khi một người kết nối với ta
});
// Lấy socket từ một địa chỉ
const socket = new WS("SOME ADDRESS");
// Kết nối với một node qua socket
socket.on("open", () => {
    // Event handler này sẽ được chạy khi ta kết nối với họ
})
// Chờ 
socket.on("close", () => {
    // Event handler này sẽ được chạy khi họ ngừng kết nối với ta
})
// Nghe các tin nhắn
socket.on("message", message => {
    // "message" chính là tin nhắn nhé
})